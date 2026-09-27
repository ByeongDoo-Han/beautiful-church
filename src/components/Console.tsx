'use client';
import { ChoiceButtons } from './ChoiceButtons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Church, Cloud, Download, Edit3, Maximize2, Monitor, MonitorUp, Moon, Plus, Radio, RefreshCw, X } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { YouTubePlayer } from './YouTubePlayer';
import { YouTubeLinkField } from './YouTubeLinkField';
import { SlideView } from './SlideView';
import { SlideEditor } from './SlideEditor';
import { ServerFiles } from './ServerFiles';
import { demoManifest, emptyManifest, errorText, initialSnapshot, manifestSchema, slideIndex, slideKey, snapshotSchema, type Manifest, type ManifestEnvelope, type Snapshot } from '@/lib/model';
import { clearLocalFiles, deleteLocalManifest, fileFor, importFile, jsonRequest, localManifest, prepareOffline, saveLocalManifest, uploadAsset } from '@/lib/client-storage';
import { rendererModules } from '@/lib/decks';
import { chooseDownload, createMaterialArchive, saveDownload } from '@/lib/download';
import { appendCard, currentSection, patchSection, withSections } from '@/lib/sections';
import { ServiceQueue } from './ServiceQueue';
import { ResizableWorkspace } from './ResizableWorkspace';
import { SyncBus, type OutputStatus } from '@/lib/sync';
import { chooseOutputScreen, openOutput, requestOutputFullscreen, type DetailedScreen, type ManagedWindow, type ScreenDetails } from '@/lib/screens';

export function Console() {
  const [manifest, setManifest] = useState<Manifest>(emptyManifest); const manifestRef = useRef(manifest); manifestRef.current = manifest;
  const [etag, setEtag] = useState<string | null>(null); const etagRef = useRef(etag); etagRef.current = etag; const [selected, setSelected] = useState('');
  const [state, setState] = useState<Snapshot>(initialSnapshot); const stateRef = useRef(state); stateRef.current = state;
  const [mode, setMode] = useState('local'); const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false); const [queueEditing, setQueueEditing] = useState(false); const [usePdf, setUsePdf] = useState(false);
  const [serverFilesOpen, setServerFilesOpen] = useState(false);
  const canEdit = ready && authenticated;
  const [dirty, setDirty] = useState(false); const dirtyRef = useRef(false);
  const [cloudSaved, setCloudSaved] = useState(false); const [savingCloud, setSavingCloud] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ManifestEnvelope | null>(null);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const cacheNamespace = mode === 'cloud' ? 'cloud-published' : mode;
  const persistDraft = (value: ManifestEnvelope) => {
    setSavedDraft(value);
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => saveLocalManifest('cloud-draft', value));
    void draftWrites.current.catch(error => setMessage(`편집본 PC 저장 실패: ${errorText(error)}`));
  };
  const applyEdit = (value: Manifest) => {
    if (JSON.stringify(value) === JSON.stringify(manifestRef.current)) return;
    setCloudSaved(false);
    if (mode === 'cloud') { dirtyRef.current = true; setDirty(true); persistDraft({ manifest: value, etag: etagRef.current }); }
    setManifest(value);
  };
  const editManifest = (value: Manifest) => { if (canEdit && !busy) applyEdit(value); };
  const [slideEditorOpen, setSlideEditorOpen] = useState(false);
  const [message, setMessage] = useState(''); const [renderError, setRenderError] = useState('');
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true);
  const importFiles = async (files: File[], sectionId?: string) => {
    if (!canEdit || busy) return;
    setBusy('자료 불러오기'); setMessage('');
    let next = manifestRef.current; const errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const imported = await importFile(file);
          if (sectionId && imported.kind === 'mp3') throw new Error('섹션 자료에는 PPTX 또는 PDF를 지정해 주세요.');
          const existing = next.assets.find(a => a.id === imported.id);
          const asset = existing ?? imported;
          const candidate = { ...next, assets: existing ? next.assets : [...next.assets, asset] };
          if (sectionId) {
            if (!withSections(candidate).sections.some(s => s.id === sectionId)) throw new Error('자료를 연결할 섹션을 찾을 수 없습니다.');
            next = manifestSchema.parse(patchSection(candidate, sectionId, { presentationId: asset.id }));
          } else if (!existing) {
            next = manifestSchema.parse(appendCard(candidate, { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 100), ...(asset.kind === 'mp3' ? { audioId: asset.id } : { presentationId: asset.id }) }));
          }
        } catch (error) { errors.push(`${file.name}: ${errorText(error)}`); }
      }
      applyEdit(next);
      setMessage(errors.length ? errors.join(' / ') : `${files.length}개 파일을 확인했습니다.${sectionId ? ' 섹션 자료를 변경했습니다.' : ''}`);
    } finally { setBusy(''); }
  };
  const [screens, setScreens] = useState<DetailedScreen[]>([]); const [screen, setScreen] = useState<DetailedScreen | null>(null);
  const [screenSupported, setScreenSupported] = useState(false); const screenDetails = useRef<ScreenDetails | null>(null); const screenCleanup = useRef<() => void>(() => {});
  const [output, setOutput] = useState<(OutputStatus & { at: number }) | null>(null); const [opened, setOpened] = useState(false); const [now, setNow] = useState(0);
  const editingRef = useRef(false); editingRef.current = queueEditing || slideEditorOpen || !!busy;
  const session = useRef(''); const bus = useRef<SyncBus | null>(null); const outputWindow = useRef<Window | null>(null);
  const active = manifest.items.find(i => i.id === selected) ?? manifest.items[0];
  const range = currentSection(manifest, active?.id);
  const presentationOwner = range?.owner;
  const assetId = usePdf && presentationOwner?.fallbackPdfId ? presentationOwner.fallbackPdfId : presentationOwner?.presentationId;
  const asset = manifest.assets.find(a => a.id === assetId) ?? null;
  const presentationEdit = asset?.kind === 'pptx' && presentationOwner?.presentationEdit?.assetId === asset.id ? presentationOwner.presentationEdit : undefined;
  const audio = manifest.assets.find(a => a.id === active?.audioId) ?? null;

  const change = useCallback((patch: Partial<Snapshot>) => {
    const next = { ...stateRef.current, ...patch, revision: stateRef.current.revision + 1 };
    stateRef.current = next; setState(next);
    bus.current?.send({ type: 'state', state: next });
    try { sessionStorage.setItem('worship-state', JSON.stringify(next)); } catch { /* live state still works when storage is unavailable */ }
  }, []);
  const navigate = useCallback((delta: number) => { const current = stateRef.current; change({ slide: slideIndex(current.slide + delta, current.count) }); }, [change]);
  useEffect(() => {
    let cancelled = false;
    setNow(Date.now()); setOnline(navigator.onLine); setScreenSupported(typeof (window as ManagedWindow).getScreenDetails === 'function');
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
      if (!config.authenticated) { location.replace('/login'); return; }
      const namespace = config.cloud ? 'cloud' : 'local'; localStorage.setItem('worship-mode', namespace);
      let saved = await localManifest(config.cloud ? 'cloud-published' : namespace).catch(() => undefined);
      if (config.cloud) {
        try {
          const remote = await jsonRequest<ManifestEnvelope>('/api/manifest');
          saved = { ...remote, manifest: withSections(manifestSchema.parse(remote.manifest)) };
        } catch (error) {
          if (!cancelled) setMessage(saved ? '서버에 연결할 수 없어 마지막 서버 저장본을 표시합니다.' : `서버 저장본을 불러오지 못했습니다: ${errorText(error)}`);
        }
        if (saved) {
          try { await saveLocalManifest('cloud-published', saved); }
          catch { if (!cancelled) setMessage('서버 저장본은 불러왔지만 이 PC의 오프라인 저장에 실패했습니다.'); }
        }
        if (config.authenticated) {
          try {
          let draft = await localManifest('cloud-draft');
          const legacy = await localManifest('cloud');
          // Preserve the old administrator cache as an explicit recovery copy,
          // never as the default view. Normalize legacy section layouts first.
          if (!draft && legacy && (!saved || JSON.stringify(withSections(manifestSchema.parse(legacy.manifest))) !== JSON.stringify(withSections(manifestSchema.parse(saved.manifest))))) {
            draft = legacy; await saveLocalManifest('cloud-draft', draft);
          }
          if (legacy) await deleteLocalManifest('cloud');
          if (draft && saved && JSON.stringify(withSections(manifestSchema.parse(draft.manifest))) === JSON.stringify(withSections(manifestSchema.parse(saved.manifest)))) {
            await deleteLocalManifest('cloud-draft'); draft = undefined;
          }
          if (!cancelled) setSavedDraft(draft ?? null);
          } catch { if (!cancelled) setMessage('서버 저장본을 표시합니다. PC 편집본 보관 상태를 확인하지 못했습니다.'); }
        }
      }
      const value = withSections(saved ? manifestSchema.parse(saved.manifest) : config.cloud ? emptyManifest : demoManifest);
      if (cancelled) return;
      setMode(namespace); setAuthenticated(config.authenticated); setManifest(value); setEtag(saved?.etag ?? null);
      const selectedId = sessionStorage.getItem('worship-selected') ?? value.items[0]?.id ?? '';
      setSelected(selectedId); setUsePdf(currentSection(value, selectedId)?.owner.fallbackPdfId === stateRef.current.asset?.id && !!stateRef.current.asset); setReady(true);
    })().catch(e => { if (!cancelled) { setMessage(errorText(e)); setReady(true); } });
    const network = () => setOnline(navigator.onLine); window.addEventListener('online', network); window.addEventListener('offline', network);
    const interval = setInterval(() => { setNow(Date.now()); if (outputWindow.current?.closed) { outputWindow.current = null; channel.peer = null; setOpened(false); setOutput(null); } }, 1000);
    return () => { cancelled = true; channel.close(); bus.current = null; clearInterval(interval); screenCleanup.current(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [navigate]);
  useEffect(() => {
    if (!ready || !authenticated || mode === 'cloud') return;
    void saveLocalManifest(mode, { manifest, etag }).catch(e => setMessage(`PC 저장 실패: ${errorText(e)}`));
  }, [manifest, etag, mode, ready, authenticated]);
  useEffect(() => {
    if (!ready) return;
    const old = stateRef.current;
    const assetChanged = old.asset?.id !== asset?.id;
    const ownerChanged = old.presentationOwnerId !== undefined && old.presentationOwnerId !== presentationOwner?.id;
    if (assetChanged || old.title !== active?.title || old.presentationOwnerId !== presentationOwner?.id || old.presentationEdit?.version !== presentationEdit?.version) {
      const count = presentationEdit?.slides.length ?? (assetChanged ? 0 : old.count);
      setRenderError(''); change({ asset, title: active?.title ?? '', presentationOwnerId: presentationOwner?.id, presentationEdit, count, slide: assetChanged || ownerChanged ? 0 : slideIndex(old.slide, count) });
    } else if (old.revision === 0) change({});
  }, [asset, active?.title, presentationOwner?.id, presentationEdit, ready, change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (queueEditing || serverFilesOpen || slideEditorOpen || element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return;
      if (e.key === ' ' && element.tagName === 'BUTTON') return;
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); navigate(e.key === 'ArrowLeft' ? -1 : 1); }
      if (e.key.toLowerCase() === 'b') change({ blackout: !stateRef.current.blackout });
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [queueEditing, serverFilesOpen, slideEditorOpen, navigate, change]);
  useEffect(() => {
    if (!ready || mode !== 'cloud') return;
    let cancelled = false; let running = false;
    const refresh = async () => {
      if (running || dirtyRef.current || editingRef.current || !navigator.onLine || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const envelope = await jsonRequest<ManifestEnvelope>('/api/manifest');
        const latest = withSections(manifestSchema.parse(envelope.manifest));
        if (cancelled) return;
        if (dirtyRef.current || editingRef.current) return;
        if (envelope.etag !== etagRef.current || JSON.stringify(latest) !== JSON.stringify(manifestRef.current)) {
          setManifest(latest); setEtag(envelope.etag);
          // The presentation effect updates both previews and screen 2 with the
          // new edits, retaining the current page where it still exists.
        }
        try { await saveLocalManifest('cloud-published', { ...envelope, manifest: latest }); }
        catch { if (!cancelled) setMessage('최신 내용은 표시했지만 이 PC의 오프라인 저장에 실패했습니다.'); return; }
      } catch (error) {
        if (!cancelled) setMessage(`최신 저장본 확인 실패: ${errorText(error)} 이전에 불러온 내용을 표시합니다.`);
      } finally { running = false; }
    };
    const check = () => { void refresh(); };
    window.addEventListener('focus', check); window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 15000);
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener('focus', check); window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [ready, authenticated, mode]);
  const selectItem = (id: string) => { setSelected(id); if (currentSection(manifest, id)?.owner.id !== presentationOwner?.id) setUsePdf(false); sessionStorage.setItem('worship-selected', id); };
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
    if (busy || !ready) return;
    setBusy('저장 위치 선택'); setMessage('');
    try {
      const value = structuredClone(manifestRef.current);
      const target = await chooseDownload(value.title);
      const refs = new Set([...value.items.flatMap(i => [i.audioId, i.presentationId, i.fallbackPdfId]), ...(value.sections ?? []).flatMap(s => [s.presentationId, s.fallbackPdfId])].filter(Boolean));
      const assets = value.assets.filter(a => refs.has(a.id));
      const archive = await createMaterialArchive(value, assets, fileFor, setBusy);
      setBusy('파일 저장'); await saveDownload(target, archive);
      const saved = target.handle ? `“${target.name}”을 선택한 위치에 저장했습니다.` : `“${target.name}” 다운로드를 요청했습니다. 저장 위치는 브라우저 다운로드 설정을 따릅니다.`;
      let offline = '로그인한 화면을 유지하면 오프라인에서도 사용할 수 있습니다.';
      try {
        if (!(mode === 'cloud' && dirtyRef.current)) await saveLocalManifest(cacheNamespace, { manifest: value, etag });
        await rendererModules();
        setBusy('오프라인 앱 준비'); await prepareOffline();
      } catch (error) { offline = `오프라인 준비는 완료되지 않았습니다: ${errorText(error)}`; }
      const youtubeCount = value.items.filter(item => item.audioSource === 'youtube').length;
      setMessage(`준비 완료 · ${saved} ${assets.length}개 원본 자료와 슬라이드 편집 정보를 포함했습니다. ${offline}${youtubeCount ? ` 유튜브 ${youtubeCount}곡은 링크만 포함됩니다.` : ''}`);
    } catch (e) { setMessage(e instanceof Error && e.name === 'AbortError' ? '다운로드를 취소했습니다.' : `자료 저장 실패: ${errorText(e)}`); } finally { setBusy(''); }
  };
  const saveCloud = async () => {
    if (!canEdit || !dirtyRef.current || busy || mode !== 'cloud' || !online) return;
    setSavingCloud(true); setCloudSaved(false);
    setBusy('서버 저장'); setMessage('');
    try {
      const next = { ...manifestRef.current, assets: [...manifestRef.current.assets] };
      for (let i = 0; i < next.assets.length; i++) {
        next.assets[i] = await uploadAsset(next.assets[i], percent => setBusy(`업로드 ${i + 1}/${next.assets.length} · ${Math.round(percent)}%`));
        // Persist successful uploads before committing the manifest, so failed saves can be retried.
        persistDraft({ manifest: { ...next, assets: [...next.assets] }, etag });
        await draftWrites.current;
        setManifest({ ...next, assets: [...next.assets] });
      }
      const saved = await jsonRequest<ManifestEnvelope>('/api/manifest', { method: 'PUT', body: JSON.stringify({ manifest: next, etag }) });
      dirtyRef.current = false; setDirty(false); setSavedDraft(null); setCloudSaved(true);
      setManifest(withSections(saved.manifest)); setEtag(saved.etag);
      try {
        await draftWrites.current;
        await saveLocalManifest('cloud-published', saved);
        await deleteLocalManifest('cloud-draft');
        setMessage('서버 저장 완료');
      } catch { setMessage('서버 저장은 완료됐지만 PC 저장본 정리에 실패했습니다. 서버 저장본은 정상적으로 공유됩니다.'); }
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(''); setSavingCloud(false); }
  };
  const reloadCloud = async () => {
    if (!canEdit || mode !== 'cloud') return;
    if (dirtyRef.current && !confirm('현재 편집본은 PC에 보관하고 서버 저장본을 표시할까요?')) return;
    setBusy('서버 자료 불러오기');
    try {
      await draftWrites.current;
      const value = await jsonRequest<ManifestEnvelope>('/api/manifest');
      const latest = withSections(manifestSchema.parse(value.manifest));
      await saveLocalManifest('cloud-published', { ...value, manifest: latest });
      dirtyRef.current = false; setDirty(false); setManifest(latest); setEtag(value.etag);
      setSelected(latest.items[0]?.id ?? ''); setUsePdf(false); setMessage('서버 저장본을 불러왔습니다.');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(''); }
  };
  const restoreDraft = () => {
    if (!canEdit || !savedDraft || dirtyRef.current || busy) return;
    const draft = withSections(manifestSchema.parse(savedDraft.manifest));
    const outdated = (savedDraft.etag?.replace(/^W\//, '') ?? null) !== (etagRef.current?.replace(/^W\//, '') ?? null);
    dirtyRef.current = true; setDirty(true); setCloudSaved(false); setManifest(draft); setEtag(savedDraft.etag);
    setSelected(draft.items[0]?.id ?? ''); setUsePdf(false);
    setMessage(outdated ? '이전 서버 저장본을 기준으로 한 편집본을 복구했습니다. 서버 내용이 바뀌어 바로 덮어쓸 수 없으므로 변경 내용을 확인해 주세요.' : '미저장 편집본을 복구했습니다. 서버 저장을 누르기 전까지 다른 사용자에게 반영되지 않습니다.');
  };
  const live = !!output && now - output.at < 6500;
  const rendered = live && output?.renderedKey === slideKey(state);
  const statusText = !opened ? '출력창 닫힘' : !live ? output ? '출력창 연결 끊김' : '연결 확인 중' : !rendered ? '슬라이드 준비 중' : output.fullscreen ? '전체화면 출력 중' : '창 모드 연결됨';
  return <ResizableWorkspace sidebar={
    <aside id="worship-sidebar" className="sidebar"><div className="sidebar-header"><a className="brand" href="/admin"><span className="brand-mark"><Church size={22} /></span><div>아름다운교회 영아부<small>BEAUTIFUL CHURCH · INFANT MINISTRY</small></div></a>{mode === 'cloud' && canEdit && <button className="server-files-trigger" aria-label="서버 파일 목록" title="서버 파일 목록" disabled={!online} onClick={() => setServerFilesOpen(true)}><Cloud size={16} /></button>}</div>
      <div className="queue-title"><span>예배 순서</span><span>{manifest.items.length}</span>{canEdit && <button aria-label="예배 순서 추가" disabled={!!busy || !ready || manifest.items.length >= 100} onClick={() => editManifest(appendCard(manifest, { id: crypto.randomUUID(), title: '새 예배 순서' }, withSections(manifest).sections.at(-1)?.id))}><Plus size={17} /></button>}</div>
      <ServiceQueue manifest={manifest} selected={active?.id} disabled={!!busy || !ready} canEdit={canEdit} editing={queueEditing} onEditingChange={setQueueEditing} onImport={importFiles} onSelect={selectItem} onChange={editManifest} />
      {canEdit && <div className="sidebar-admin-actions" role="group" aria-label="관리자 저장 및 계정"><button className="primary" disabled={mode !== 'cloud' || !dirty || !!busy || !online} aria-busy={savingCloud} onClick={saveCloud}>{cloudSaved && !dirty ? <Check size={14} /> : <Cloud size={14} />}{savingCloud ? '저장 중…' : cloudSaved && !dirty ? '저장완료' : '서버 저장'}</button><button aria-label="서버 자료 다시 불러오기" disabled={mode !== 'cloud' || !!busy || !online} onClick={reloadCloud}><RefreshCw size={16} /></button><button className="sidebar-logout" onClick={async () => { await draftWrites.current; await jsonRequest('/api/logout', { method: 'POST' }); setAuthenticated(false); setQueueEditing(false); setSlideEditorOpen(false); bus.current?.send({ type: 'command', command: 'close' }); outputWindow.current?.close(); try { localStorage.setItem('worship-logout', String(Date.now())); } catch { /* The server session is already cleared. */ } location.replace('/login'); }}>로그아웃</button></div>}
    </aside>}>
    <main className="console-main"><header className="topbar"><div className="topbar-heading"><div className="console-title"><span className="eyebrow">WORSHIP CONTROL</span><h1>예배 운영 콘솔</h1><p>찬양과 말씀에 집중할 수 있도록, 한 화면에서.</p></div><div className="service-summary"><span className="eyebrow">TODAY’S SERVICE</span><h2>{manifest.title}</h2><p>{now ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(now) : '오늘의 예배'}</p></div></div><div className="header-actions"><button onClick={prepare} disabled={!!busy || !ready}><Download size={17} />{busy || '예배 자료 다운로드'}</button><button className="primary" disabled={!ready} onClick={launch}><MonitorUp size={18} />출력창 열기</button></div></header>
      <div className="connection-bar"><span className={`connection-indicator ${rendered ? 'connected' : ''}`} /><strong>{statusText}</strong><span className="connection-detail">{screen?.label || '출력창을 원하는 모니터로 이동하세요'}</span>{live && <span className="badge">{output?.visible ? '화면 표시 중' : '창 숨김'}</span>}<span className="connection-spacer" /><button className="text-button" disabled={!screenSupported} onClick={connectScreens}><Monitor size={15} />{screenSupported ? '두 번째 화면 자동 선택' : '수동 모니터 이동'}</button>{screens.length > 0 && <ChoiceButtons className="monitor-choices" label="출력 모니터 선택" value={String(screen ? screens.indexOf(screen) : -1)} onChange={id => setScreen(screens[Number(id)] ?? null)} options={[{ value: '-1', label: '수동으로 이동' }, ...screens.map((s, i) => ({ value: String(i), label: `${s.label || `화면 ${i + 1}`} · ${s.width} × ${s.height}` }))]} />}</div>
      {canEdit && mode === 'cloud' && <div className="library-source"><span>{dirty ? '미저장 편집 중 · 서버 저장 전에는 관리자 화면에만 표시됩니다.' : '서버 저장본 · 다른 로그인 기기와 같은 자료를 표시합니다.'}</span>{!dirty && savedDraft && <div><span>이 PC에 보관된 편집본이 있습니다.</span><button disabled={!!busy} onClick={restoreDraft}>미저장 편집본 복구</button><button disabled={!!busy} onClick={async () => { if (!confirm('이 PC에 보관된 미저장 편집본을 삭제할까요? 서버 저장본은 유지됩니다.')) return; try { await draftWrites.current; await deleteLocalManifest('cloud-draft'); setSavedDraft(null); } catch (error) { setMessage(errorText(error)); } }}>편집본 삭제</button></div>}</div>}
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="안내 닫기" onClick={() => setMessage('')}><X size={15} /></button></div>}
      <div className="view-heading"><div><span className="eyebrow">PRESENTATION</span><h2>{active?.title ?? (canEdit ? '첫 예배 순서를 추가해 주세요' : '등록된 예배 순서가 없습니다')}</h2></div><div className="format-switch">{canEdit && asset?.kind === 'pptx' && <button disabled={!!busy || !state.count} onClick={() => setSlideEditorOpen(true)}><Edit3 size={15} />슬라이드 편집</button>}{presentationOwner?.fallbackPdfId && <button aria-label={usePdf ? 'PPTX로 돌아가기' : 'PDF로 전환'} onClick={() => { setUsePdf(v => !v); setRenderError(''); }}>{usePdf ? 'PPTX로 돌아가기' : 'PDF로 전환'}</button>}</div></div>
      {range && range.count > 1 && <p className="slide-hold-status" role="status">‘{range.owner.title}’ 슬라이드 유지 · {range.position}/{range.count}번째 순서 · 같은 PPT 섹션</p>}
      <section className="preview-grid"><div className="current-preview"><div className="preview-title"><span><Radio size={13} />현재 슬라이드</span><span>{state.count ? `${state.slide + 1} / ${state.count}` : '—'}</span></div><SlideView asset={state.asset} edit={state.presentationEdit} index={state.slide} label="현재 슬라이드 미리보기" onReady={count => { if (stateRef.current.asset?.id === state.asset?.id && stateRef.current.count !== count) change({ count, slide: slideIndex(stateRef.current.slide, count) }); }} onError={setRenderError} /><div className="preview-footer"><span><span className="live-dot" />{state.blackout ? '출력 화면 가림' : rendered ? '출력창과 동기화됨' : '운영자 미리보기'}</span><span>{state.asset?.name ?? 'PPTX / PDF'}</span></div></div>
      <div className="next-preview"><div className="preview-title"><span>다음 슬라이드</span><span>NEXT</span></div>{state.asset && state.count > 0 && state.slide + 1 < state.count ? <SlideView asset={state.asset} edit={state.presentationEdit} index={state.slide + 1} label="다음 슬라이드 미리보기" /> : <div className="end-preview"><Check size={26} /><span>{state.count ? '마지막 슬라이드입니다' : '슬라이드를 준비해 주세요'}</span></div>}<div className="next-tip"><ArrowRight size={16} /><p>다음 장을 미리 확인하고<br />차분하게 예배를 이어가세요.</p></div></div></section>
      {(renderError || output?.error) && <div className="notice warning" role="alert">{renderError || output?.error} {asset?.kind === 'pptx' && 'PDF를 연결한 뒤 전환할 수 있습니다.'}</div>}
      <section className="presentation-controls"><div className="slide-navigation"><button aria-label="이전 슬라이드" disabled={!state.count || state.slide === 0} onClick={() => navigate(-1)}><ArrowLeft size={18} />이전</button><span className="slide-counter"><strong>{state.count ? String(state.slide + 1).padStart(2, '0') : '—'}</strong><span>/ {String(state.count).padStart(2, '0')}</span></span><button aria-label="다음 슬라이드" disabled={!state.count || state.slide >= state.count - 1} onClick={() => navigate(1)}>다음<ArrowRight size={18} /></button></div><div className="output-actions"><button className={state.blackout ? 'active-toggle' : ''} onClick={() => change({ blackout: !state.blackout })}><Moon size={17} />{state.blackout ? '가림 해제' : '화면 가리기'}</button><button disabled={!opened} onClick={fullscreen}><Maximize2 size={17} />전체화면 요청</button><button title="출력창 전체화면 해제" aria-label="출력창 전체화면 해제" disabled={!output?.fullscreen} onClick={() => bus.current?.send({ type: 'command', command: 'exit-fullscreen' })}><Monitor size={17} /></button><button aria-label="출력창 닫기" disabled={!opened} onClick={() => { bus.current?.send({ type: 'command', command: 'close' }); outputWindow.current?.close(); setOpened(false); setOutput(null); }}><X size={17} /></button></div></section>
      {canEdit && active && <section className="inline-audio-editor" aria-label="선택한 예배 순서 음원 편집">
        <ChoiceButtons className="audio-source-field" label="찬양 재생 방식" ariaLabel={`${active.title} 재생 방식`} disabled={!!busy} value={active.audioSource ?? 'mp3'} onChange={source => editManifest({ ...manifest, items: manifest.items.map(item => item.id === active.id ? { ...item, audioSource: source as 'mp3' | 'youtube' } : item) })} options={[{ value: 'mp3', label: 'MP3 음원 파일' }, { value: 'youtube', label: '유튜브 링크 · 화면 1' }]} />
        {active.audioSource !== 'youtube' && <ChoiceButtons label="찬양 MP3" ariaLabel={`${active.title} 찬양 MP3`} value={active.audioId ?? ''} disabled={!!busy} onChange={id => editManifest({ ...manifest, items: manifest.items.map(item => item.id === active.id ? { ...item, audioId: id || undefined } : item) })} options={[{ value: '', label: '연결하지 않음' }, ...manifest.assets.filter(a => a.kind === 'mp3').map(a => ({ value: a.id, label: a.name }))]} />}
        {active.audioSource === 'youtube' && <YouTubeLinkField key={active.id} title={active.title} track={active.youtube} disabled={!!busy} onChange={youtube => editManifest({ ...manifest, items: manifest.items.map(item => item.id === active.id ? { ...item, youtube } : item) })} />}
      </section>}
      {active?.audioSource === 'youtube'
        ? <YouTubePlayer key={active.id} track={active.youtube} title={active.title} suspended={queueEditing || serverFilesOpen || slideEditorOpen} />
        : <AudioPlayer key={active?.id ?? 'empty'} asset={audio} title={active?.title ?? '찬양'} />}
      <footer className="console-footer"><span><kbd>←</kbd><kbd>→</kbd> 슬라이드 이동 <kbd>Space</kbd> 다음 <kbd>B</kbd> 화면 가리기</span>{canEdit && <button className="text-button" disabled={!!busy || opened} onClick={async () => { if (!confirm('이 PC의 오프라인 자료와 편집 내용을 모두 삭제할까요? 서버 자료는 유지됩니다.')) return; try { await clearLocalFiles(); sessionStorage.removeItem('worship-state'); sessionStorage.removeItem('worship-selected'); location.reload(); } catch (e) { setMessage(errorText(e)); } }}>이 PC 저장 자료 지우기</button>}</footer>
    </main>
    {canEdit && slideEditorOpen && asset?.kind === 'pptx' && presentationOwner && <SlideEditor key={presentationOwner.id} scopeLabel={range && range.count > 1 ? `‘${presentationOwner.title}’ 섹션의 ${range.count}개 순서에 적용` : undefined} asset={asset} initialEdit={presentationEdit} initialIndex={state.slide} onClose={() => setSlideEditorOpen(false)} onApply={(edit, index) => {
      if (!canEdit) return;
      const next = patchSection(manifestRef.current, presentationOwner.id, { presentationEdit: edit });
      const parsed = manifestSchema.safeParse(next);
      if (!parsed.success) throw new Error('편집 내용을 저장할 수 없습니다. 문구의 양이나 슬라이드 수를 줄여 주세요.');
      applyEdit(parsed.data); change({ presentationEdit: edit, slide: index, count: edit.slides.length }); setMessage('슬라이드 편집을 화면에 적용했습니다. 이 PC에 자동 저장되며, 서버 반영은 ‘서버 저장’을 눌러 주세요.');
    }} />}
    {canEdit && serverFilesOpen && <ServerFiles onClose={() => setServerFilesOpen(false)} />}
  </ResizableWorkspace>;
}
