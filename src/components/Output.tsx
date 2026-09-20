'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { initialSnapshot, slideKey, type Snapshot } from '@/lib/model';
import { newerState, SyncBus, type OutputStatus } from '@/lib/sync';
import { SlideView } from './SlideView';
export function Output() {
  const [state, setState] = useState<Snapshot>(initialSnapshot); const current = useRef(state); current.current = state;
  const bus = useRef<SyncBus | null>(null);
  const [controls, setControls] = useState(true); const [notice, setNotice] = useState('출력창을 두 번째 모니터로 옮긴 후 전체화면을 눌러 주세요.');
  const status = useRef<OutputStatus>({ fullscreen: false, visible: true, renderedKey: null, error: null });
  const report = useCallback(() => {
    status.current = { ...status.current, fullscreen: !!document.fullscreenElement, visible: document.visibilityState === 'visible' };
    bus.current?.send({ type: 'status', status: status.current });
  }, []);
  const fullscreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); setControls(false); setNotice(''); status.current.error = null; }
    catch { setControls(true); setNotice('전체화면은 출력창에서 직접 클릭해야 할 수 있습니다. 아래 버튼을 누르거나 브라우저 전체화면을 사용하세요.'); status.current.error = '출력창에서 전체화면 버튼 클릭이 필요합니다.'; }
    report();
  }, [report]);
  useEffect(() => {
    const session = location.hash.slice(1);
    if (!/^[a-f0-9-]{36}$/.test(session)) { setNotice('운영자 콘솔에서 출력창을 열어 주세요.'); return; }
    const channel = new SyncBus(session, message => {
      if (message.type === 'state') {
        if (message.state.revision <= current.current.revision) return;
        if (slideKey(message.state) !== slideKey(current.current)) { status.current.renderedKey = null; status.current.error = null; }
        current.current = newerState(current.current, message.state); setState(current.current); report();
      }
      if (message.type === 'command') {
        if (message.command === 'fullscreen') void fullscreen();
        if (message.command === 'exit-fullscreen' && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        if (message.command === 'close') window.close();
      }
    });
    channel.peer = window.opener; bus.current = channel;
    const hello = () => { channel.send({ type: 'hello' }); report(); };
    hello(); const timer = setInterval(hello, 2000);
    const bye = () => channel.send({ type: 'bye' }); window.addEventListener('pagehide', bye);
    const fs = () => { setControls(!document.fullscreenElement); if (document.fullscreenElement) { status.current.error = null; setNotice(''); } report(); };
    const key = (event: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', ' '].includes(event.key)) { event.preventDefault(); channel.send({ type: 'navigate', delta: event.key === 'ArrowLeft' ? -1 : 1 }); }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void fullscreen(); }
      if (event.key === 'Escape') setControls(true);
    };
    document.addEventListener('fullscreenchange', fs); document.addEventListener('visibilitychange', report); window.addEventListener('keydown', key);
    return () => { clearInterval(timer); channel.close(); bus.current = null; window.removeEventListener('pagehide', bye); document.removeEventListener('fullscreenchange', fs); document.removeEventListener('visibilitychange', report); window.removeEventListener('keydown', key); };
  }, [fullscreen, report]);
  return <main className={`output-page ${controls ? '' : 'presentation-running'}`} onDoubleClick={() => setControls(v => !v)}>
    <div className="output-slide" style={{ visibility: state.blackout ? 'hidden' : 'visible' }}>
      <SlideView asset={state.asset} index={state.slide} label="출력 슬라이드" onReady={() => { status.current.renderedKey = slideKey(state); report(); }} onError={error => { status.current.error = error; report(); }} />
    </div>
    {controls && <div className="output-setup"><span className="eyebrow">BEAUTIFUL CHURCH · OUTPUT</span><h1>예배 화면을 준비해 주세요</h1><p>{notice || '전체화면으로 슬라이드만 표시합니다.'}</p><button className="primary" onClick={fullscreen}><Maximize2 size={18} />전체화면 시작</button><button onClick={() => setControls(false)}>슬라이드만 표시</button><small>F 전체화면 · Esc 안내 표시 · 더블클릭 안내 숨기기/표시</small></div>}
  </main>;
}
