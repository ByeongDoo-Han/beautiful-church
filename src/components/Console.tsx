'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Church, Cloud, Download, Edit3, ExternalLink, Maximize2, Monitor, MonitorUp, Moon, Music2, PanelLeft, Plus, Presentation, Radio, RefreshCw, Settings2, Wifi, WifiOff, X } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { SlideView } from './SlideView';
import { LibraryEditor } from './LibraryEditor';
import { demoManifest, emptyManifest, errorText, initialSnapshot, manifestSchema, slideIndex, slideKey, snapshotSchema, type Manifest, type ManifestEnvelope, type Snapshot } from '@/lib/model';
import { clearLocalFiles, fileFor, hasFile, jsonRequest, localManifest, prepareOffline, saveLocalManifest, uploadAsset } from '@/lib/client-storage';
import { rendererModules } from '@/lib/decks';
import { SyncBus, type OutputStatus } from '@/lib/sync';
import { chooseOutputScreen, openOutput, requestOutputFullscreen, type DetailedScreen, type ManagedWindow, type ScreenDetails } from '@/lib/screens';

export function Console() {
  const [manifest, setManifest] = useState<Manifest>(emptyManifest); const manifestRef = useRef(manifest); manifestRef.current = manifest;
  const [etag, setEtag] = useState<string | null>(null); const [selected, setSelected] = useState('');
  const [state, setState] = useState<Snapshot>(initialSnapshot); const stateRef = useRef(state); stateRef.current = state;
  const [mode, setMode] = useState('local'); const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false); const [editor, setEditor] = useState(false); const [usePdf, setUsePdf] = useState(false);
  const [message, setMessage] = useState(''); const [renderError, setRenderError] = useState('');
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true); const [cached, setCached] = useState<Set<string>>(new Set());
  const [screens, setScreens] = useState<DetailedScreen[]>([]); const [screen, setScreen] = useState<DetailedScreen | null>(null);
  const [screenSupported, setScreenSupported] = useState(false); const screenDetails = useRef<ScreenDetails | null>(null); const screenCleanup = useRef<() => void>(() => {});
  const [output, setOutput] = useState<(OutputStatus & { at: number }) | null>(null); const [opened, setOpened] = useState(false); const [now, setNow] = useState(0);
  const session = useRef(''); const bus = useRef<SyncBus | null>(null); const outputWindow = useRef<Window | null>(null);
  const active = manifest.items.find(i => i.id === selected) ?? manifest.items[0];
  const assetId = usePdf && active?.fallbackPdfId ? active.fallbackPdfId : active?.presentationId;
  const asset = manifest.assets.find(a => a.id === assetId) ?? null;
  const audio = manifest.assets.find(a => a.id === active?.audioId) ?? null;

  const change = useCallback((patch: Partial<Snapshot>) => {
    const next = { ...stateRef.current, ...patch, revision: stateRef.current.revision + 1 };
    stateRef.current = next; setState(next);
    bus.current?.send({ type: 'state', state: next });
    try { sessionStorage.setItem('worship-state', JSON.stringify(next)); } catch { /* live state still works when storage is unavailable */ }
  }, []);
  const navigate = useCallback((delta: number) => { const current = stateRef.current; change({ slide: slideIndex(current.slide + delta, current.count) }); }, [change]);
  const refreshCached = useCallback(async (value: Manifest) => {
    const result = await Promise.all(value.assets.map(async a => await hasFile(a.id) ? a.id : null)); setCached(new Set(result.filter((id): id is string => !!id)));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setOnline(navigator.onLine); setScreenSupported(typeof (window as ManagedWindow).getScreenDetails === 'function');
    let id = sessionStorage.getItem('worship-session'); if (!id || !/^[a-f0-9-]{36}$/.test(id)) { id = crypto.randomUUID(); sessionStorage.setItem('worship-session', id); }
    session.current = id;
    try { const restored = snapshotSchema.safeParse(JSON.parse(sessionStorage.getItem('worship-state') ?? 'null')); if (restored.success) { stateRef.current = restored.data; setState(restored.data); } } catch { /* ignore invalid saved state */ }
    const channel = new SyncBus(id, msg => {
      if (msg.type === 'hello') { if (channel.peer) outputWindow.current = channel.peer; channel.send({ type: 'state', state: stateRef.current }); }
      if (msg.type === 'bye') { setOpened(false); setOutput(null); }
      if (msg.type === 'status') { setOutput({ ...msg.status, at: Date.now() }); setOpened(true); }
      if (msg.type === 'navigate') navigate(msg.delta);
    }, true); bus.current = channel;
    void (async () => {
      let config = { cloud: localStorage.getItem('worship-mode') === 'cloud', authenticated: false };
      try { config = await jsonRequest('/api/config'); } catch { /* offline uses the last selected data namespace */ }
      const namespace = config.cloud ? 'cloud' : 'local'; localStorage.setItem('worship-mode', namespace);
      let saved = await localManifest(namespace);
      if (!saved && config.cloud && config.authenticated) saved = await jsonRequest<ManifestEnvelope>('/api/manifest');
      const value = saved ? manifestSchema.parse(saved.manifest) : config.cloud ? emptyManifest : demoManifest;
      if (cancelled) return;
      setMode(namespace); setAuthenticated(config.authenticated); setManifest(value); setEtag(saved?.etag ?? null);
      const selectedId = sessionStorage.getItem('worship-selected') ?? value.items[0]?.id ?? '';
      setSelected(selectedId); setUsePdf(value.items.find(i => i.id === selectedId)?.fallbackPdfId === stateRef.current.asset?.id && !!stateRef.current.asset); setReady(true); await refreshCached(value);
    })().catch(e => { if (!cancelled) { setMessage(errorText(e)); setReady(true); } });
    const network = () => setOnline(navigator.onLine); window.addEventListener('online', network); window.addEventListener('offline', network);
    const cacheChanged = () => { void refreshCached(manifestRef.current).catch(() => {}); }; window.addEventListener('worship-file-cached', cacheChanged);
    const interval = setInterval(() => { setNow(Date.now()); if (outputWindow.current?.closed) { outputWindow.current = null; channel.peer = null; setOpened(false); setOutput(null); } }, 1000);
    return () => { cancelled = true; channel.close(); bus.current = null; clearInterval(interval); screenCleanup.current(); window.removeEventListener('worship-file-cached', cacheChanged); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [navigate, refreshCached]);
  useEffect(() => {
    if (!ready) return;
    void saveLocalManifest(mode, { manifest, etag }).then(() => refreshCached(manifest)).catch(e => setMessage(`PC 저장 실패: ${errorText(e)}`));
  }, [manifest, etag, mode, ready, refreshCached]);
  useEffect(() => {
    if (!ready) return;
    const old = stateRef.current;
    if (old.asset?.id !== asset?.id || old.title !== active?.title) {
      setRenderError(''); change({ asset, title: active?.title ?? '', ...(old.asset?.id !== asset?.id ? { slide: 0, count: 0 } : {}) });
    } else if (old.revision === 0) change({});
  }, [asset, active?.title, ready, change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (editor || element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return;
      if (e.key === ' ' && element.tagName === 'BUTTON') return;
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); navigate(e.key === 'ArrowLeft' ? -1 : 1); }
      if (e.key.toLowerCase() === 'b') change({ blackout: !stateRef.current.blackout });
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [editor, navigate, change]);
  const selectItem = (id: string) => { setSelected(id); setUsePdf(false); sessionStorage.setItem('worship-selected', id); };
  const connectScreens = async () => {
    try {
      const details = await (window as ManagedWindow).getScreenDetails!(); screenCleanup.current(); screenDetails.current = details;
      const update = () => { setScreens([...details.screens]); setScreen(chooseOutputScreen(details)); setMessage(details.screens.length > 1 ? '두 번째 화면을 선택했습니다. 출력창 열기를 누르세요.' : '추가 화면이 감지되지 않았습니다. 출력창을 수동으로 이동할 수 있습니다.'); };
      update(); details.addEventListener('screenschange', update); details.addEventListener('currentscreenchange', update);
      screenCleanup.current = () => { details.removeEventListener('screenschange', update); details.removeEventListener('currentscreenchange', update); };
    } catch { setScreen(null); setMessage('화면 권한을 사용할 수 없습니다. 출력창을 열고 두 번째 모니터로 직접 이동해 주세요.'); }
  };
  const launch = () => {
    const win = openOutput(session.current, screen);
    if (!win) { setMessage('팝업이 차단되었습니다. 주소창에서 팝업을 허용한 후 ‘출력창 열기’를 다시 눌러 주세요.'); return; }
    outputWindow.current = win; if (bus.current) bus.current.peer = win; setOpened(true); setOutput(null);
    if (screen) { try { win.moveTo(screen.availLeft, screen.availTop); win.resizeTo(screen.availWidth, screen.availHeight); } catch { /* output has manual placement instructions */ } }
    setMessage(screen ? '선택한 화면에 출력창 배치를 요청했습니다. 전체화면 시작을 눌러 주세요.' : '출력창을 두 번째 모니터로 이동한 뒤 출력창의 ‘전체화면 시작’을 눌러 주세요.');
  };
  const fullscreen = () => {
    const target = outputWindow.current;
    if (target && !target.closed) {
      try { void requestOutputFullscreen(target, screen).catch(() => bus.current?.send({ type: 'command', command: 'fullscreen' })); target.focus(); }
      catch { bus.current?.send({ type: 'command', command: 'fullscreen' }); }
    } else bus.current?.send({ type: 'command', command: 'fullscreen' });
    setMessage('브라우저가 요청을 거절하면 출력창에서 ‘전체화면 시작’을 직접 눌러 주세요.');
  };
  const prepare = async () => {
    setBusy('자료 다운로드'); setMessage('');
    try {
      const value = manifestRef.current;
      const refs = new Set(value.items.flatMap(i => [i.audioId, i.presentationId, i.fallbackPdfId]).filter(Boolean));
      const assets = value.assets.filter(a => refs.has(a.id));
      for (let i = 0; i < assets.length; i++) { setBusy(`자료 저장 ${i + 1}/${assets.length}`); await fileFor(assets[i]); }
      await saveLocalManifest(mode, { manifest: value, etag }); await rendererModules();
      setBusy('오프라인 앱 준비'); await prepareOffline(); await refreshCached(value);
      setMessage(`준비 완료 · ${assets.length}개 자료와 앱을 이 PC에 저장했습니다. 네트워크를 끊고 리허설해 보세요.`);
    } catch (e) { setMessage(errorText(e)); await refreshCached(manifestRef.current); } finally { setBusy(''); }
  };
  const saveCloud = async () => {
    setBusy('서버 저장'); setMessage('');
    try {
      const next = { ...manifestRef.current, assets: [...manifestRef.current.assets] };
      for (let i = 0; i < next.assets.length; i++) {
        next.assets[i] = await uploadAsset(next.assets[i], percent => setBusy(`업로드 ${i + 1}/${next.assets.length} · ${Math.round(percent)}%`));
        // Persist successful uploads before committing the manifest, so failed saves can be retried.
        await saveLocalManifest(mode, { manifest: { ...next, assets: [...next.assets] }, etag });
        setManifest({ ...next, assets: [...next.assets] });
      }
      const saved = await jsonRequest<ManifestEnvelope>('/api/manifest', { method: 'PUT', body: JSON.stringify({ manifest: next, etag }) });
      setManifest(saved.manifest); setEtag(saved.etag); setMessage('서버 저장 완료');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(''); }
  };
  const reloadCloud = async () => {
    if (!confirm('이 PC의 편집 내용을 서버에 저장된 자료로 바꿀까요?')) return;
    setBusy('서버 자료 불러오기');
    try { const value = await jsonRequest<ManifestEnvelope>('/api/manifest'); setManifest(value.manifest); setEtag(value.etag); setSelected(value.manifest.items[0]?.id ?? ''); setUsePdf(false); setMessage('서버 자료를 불러왔습니다.'); } catch (e) { setMessage(errorText(e)); } finally { setBusy(''); }
  };
  const live = !!output && now - output.at < 6500;
  const rendered = live && output?.renderedKey === slideKey(state);
  const statusText = !opened ? '출력창 닫힘' : !live ? output ? '출력창 연결 끊김' : '연결 확인 중' : !rendered ? '슬라이드 준비 중' : output.fullscreen ? '전체화면 출력 중' : '창 모드 연결됨';
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/admin"><span className="brand-mark"><Church size={22} /></span><div>아름다운 교회<small>BEAUTIFUL CHURCH</small></div></a>
      <div className="workspace-label">예배 워크스페이스</div><div className="nav-current"><PanelLeft size={18} />예배 운영<span className="live-dot" /></div>
      <div className="service-summary"><span className="eyebrow">TODAY’S SERVICE</span><h2>{manifest.title}</h2><p>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p></div>
      <div className="queue-title"><span>예배 순서</span><span>{manifest.items.length}</span><button aria-label="예배 순서 추가" disabled={!!busy} onClick={() => setEditor(true)}><Plus size={17} /></button></div>
      <nav className="service-queue" aria-label="곡 선택">{manifest.items.map((item, i) => <button key={item.id} className={`queue-item ${active?.id === item.id ? 'active' : ''}`} onClick={() => selectItem(item.id)}><span className="queue-number">{String(i + 1).padStart(2, '0')}</span><span className="queue-copy"><strong>{item.title}</strong><small>{item.audioId ? '찬양 MP3' : '예배 순서'}{item.presentationId ? ' · 슬라이드' : ''}</small></span>{item.audioId ? <Music2 size={15} /> : <Presentation size={15} />}</button>)}</nav>
      <button className="edit-queue" disabled={!!busy || !ready} onClick={() => setEditor(true)}><Edit3 size={16} />예배 순서 · 자료 편집</button>
      <div className="sidebar-bottom"><span className={`network ${online ? '' : 'offline'}`}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}{online ? '온라인' : '오프라인'}</span><small>{mode === 'cloud' ? 'Vercel Private Blob' : '로컬 파일 모드'} · {cached.size}/{manifest.assets.length}개 PC 저장</small></div>
    </aside>
    <main className="console-main"><header className="topbar"><div><span className="eyebrow">WORSHIP CONTROL</span><h1>예배 운영 콘솔</h1><p>찬양과 말씀에 집중할 수 있도록, 한 화면에서.</p></div><div className="header-actions"><button onClick={prepare} disabled={!!busy || !ready}><Download size={17} />{busy || '예배 자료 다운로드'}</button><button className="primary" disabled={!ready} onClick={launch}><MonitorUp size={18} />출력창 열기</button></div></header>
      <div className="connection-bar"><span className={`connection-indicator ${rendered ? 'connected' : ''}`} /><strong>{statusText}</strong><span className="connection-detail">{screen?.label || '출력창을 원하는 모니터로 이동하세요'}</span>{live && <span className="badge">{output?.visible ? '화면 표시 중' : '창 숨김'}</span>}<span className="connection-spacer" /><button className="text-button" disabled={!screenSupported} onClick={connectScreens}><Monitor size={15} />{screenSupported ? '두 번째 화면 자동 선택' : '수동 모니터 이동'}</button></div>
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="안내 닫기" onClick={() => setMessage('')}><X size={15} /></button></div>}
      <div className="view-heading"><div><span className="eyebrow">PRESENTATION</span><h2>{active?.title ?? '첫 예배 순서를 추가해 주세요'}</h2></div><div className="format-switch">{asset && <span className="badge">{asset.kind.toUpperCase()}</span>}{active?.fallbackPdfId && <button aria-label={usePdf ? 'PPTX로 돌아가기' : 'PDF로 전환'} onClick={() => { setUsePdf(v => !v); setRenderError(''); }}>{usePdf ? 'PPTX로 돌아가기' : 'PDF로 전환'}</button>}</div></div>
      <section className="preview-grid"><div className="current-preview"><div className="preview-title"><span><Radio size={13} />현재 슬라이드</span><span>{state.count ? `${state.slide + 1} / ${state.count}` : '—'}</span></div><SlideView asset={state.asset} index={state.slide} label="현재 슬라이드 미리보기" onReady={count => { if (stateRef.current.asset?.id === state.asset?.id && stateRef.current.count !== count) change({ count, slide: slideIndex(stateRef.current.slide, count) }); }} onError={setRenderError} /><div className="preview-footer"><span><span className="live-dot" />{state.blackout ? '출력 화면 가림' : rendered ? '출력창과 동기화됨' : '운영자 미리보기'}</span><span>{state.asset?.name ?? 'PPTX / PDF'}</span></div></div>
      <div className="next-preview"><div className="preview-title"><span>다음 슬라이드</span><span>NEXT</span></div>{state.asset && state.count > 0 && state.slide + 1 < state.count ? <SlideView asset={state.asset} index={state.slide + 1} label="다음 슬라이드 미리보기" /> : <div className="end-preview"><Check size={26} /><span>{state.count ? '마지막 슬라이드입니다' : '슬라이드를 준비해 주세요'}</span></div>}<div className="next-tip"><ArrowRight size={16} /><p>다음 장을 미리 확인하고<br />차분하게 예배를 이어가세요.</p></div></div></section>
      {(renderError || output?.error) && <div className="notice warning" role="alert">{renderError || output?.error} {asset?.kind === 'pptx' && 'PDF를 연결한 뒤 전환할 수 있습니다.'}</div>}
      <section className="presentation-controls"><div className="slide-navigation"><button aria-label="이전 슬라이드" disabled={!state.count || state.slide === 0} onClick={() => navigate(-1)}><ArrowLeft size={18} />이전</button><span className="slide-counter"><strong>{state.count ? String(state.slide + 1).padStart(2, '0') : '—'}</strong><span>/ {String(state.count).padStart(2, '0')}</span></span><button aria-label="다음 슬라이드" disabled={!state.count || state.slide >= state.count - 1} onClick={() => navigate(1)}>다음<ArrowRight size={18} /></button></div><div className="output-actions"><button className={state.blackout ? 'active-toggle' : ''} onClick={() => change({ blackout: !state.blackout })}><Moon size={17} />{state.blackout ? '가림 해제' : '화면 가리기'}</button><button disabled={!opened} onClick={fullscreen}><Maximize2 size={17} />전체화면 요청</button><button title="출력창 전체화면 해제" aria-label="출력창 전체화면 해제" disabled={!output?.fullscreen} onClick={() => bus.current?.send({ type: 'command', command: 'exit-fullscreen' })}><Monitor size={17} /></button><button aria-label="출력창 닫기" disabled={!opened} onClick={() => { bus.current?.send({ type: 'command', command: 'close' }); outputWindow.current?.close(); setOpened(false); setOutput(null); }}><X size={17} /></button></div></section>
      <AudioPlayer asset={audio} title={active?.title ?? '찬양'} />
      <section className="setup-panel"><div className="setup-title"><Settings2 size={18} /><strong>출력 및 자료 설정</strong><span className="badge">{mode === 'cloud' ? '클라우드 연결' : '로컬 체험'}</span></div><div className="setup-body"><div><p><strong>1</strong> 출력창 열기 <span>→</span> <strong>2</strong> 두 번째 모니터로 이동 <span>→</span> <strong>3</strong> 출력창에서 전체화면</p><small>화면 자동 선택은 지원 브라우저의 권한 승인이 필요합니다. 전체화면이 거절되면 출력창에서 직접 클릭하세요.</small>{screens.length > 0 && <select aria-label="출력 모니터 선택" value={screen ? screens.indexOf(screen) : -1} onChange={e => setScreen(screens[Number(e.target.value)] ?? null)}><option value={-1}>수동으로 이동</option>{screens.map((s, i) => <option key={`${s.left},${s.top}`} value={i}>{s.label || `화면 ${i + 1}`} · {s.width} × {s.height}</option>)}</select>}</div><div className="cloud-actions">{mode === 'cloud' ? authenticated ? <><button disabled={!!busy || !online} onClick={saveCloud}><Cloud size={16} />서버 저장</button><button aria-label="서버 자료 다시 불러오기" disabled={!!busy || !online} onClick={reloadCloud}><RefreshCw size={16} /></button><button onClick={async () => { await jsonRequest('/api/logout', { method: 'POST' }); setAuthenticated(false); setMessage('로그아웃했습니다. 이 PC에 저장된 자료는 남아 있습니다.'); }}>로그아웃</button></> : <a className="button" href="/login">관리자 로그인<ExternalLink size={14} /></a> : <small>서버 없이도 실제 PPTX·PDF·MP3를<br />불러와 예배를 진행할 수 있습니다.</small>}</div></div></section>
      <footer className="console-footer"><span><kbd>←</kbd><kbd>→</kbd> 슬라이드 이동 <kbd>Space</kbd> 다음 <kbd>B</kbd> 화면 가리기</span><button className="text-button" disabled={!!busy || opened} onClick={async () => { if (!confirm('이 PC의 오프라인 자료와 편집 내용을 모두 삭제할까요? 서버 자료는 유지됩니다.')) return; try { await clearLocalFiles(); sessionStorage.removeItem('worship-state'); sessionStorage.removeItem('worship-selected'); location.reload(); } catch (e) { setMessage(errorText(e)); } }}>이 PC 저장 자료 지우기</button></footer>
    </main>
    {editor && <LibraryEditor manifest={manifest} onChange={setManifest} onClose={() => setEditor(false)} />}
  </div>;
}
