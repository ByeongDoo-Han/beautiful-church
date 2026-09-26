'use client';
import { useEffect, useRef, useState } from 'react';
import { Youtube } from 'lucide-react';
import { loadYouTubeAPI, youtubeError, type YouTubePlayerInstance, type YouTubeTrack } from '@/lib/youtube';
import { errorText } from '@/lib/model';

export function YouTubePlayer({ track, title, suspended }: { track?: YouTubeTrack; title: string; suspended: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayerInstance | null>(null);
  const hidden = useRef(suspended); hidden.current = suspended;
  const [status, setStatus] = useState('연결 중');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const mount = host.current;
    if (!mount || !track) return;
    let cancelled = false; let ready = false; let visible = true;
    const pause = () => { try { player.current?.pauseVideo(); } catch { /* iframe can be navigating */ } };
    setStatus('연결 중'); setError('');
    const timer = setTimeout(() => { if (!ready && !cancelled) { setStatus('연결 확인 필요'); setError('유튜브 연결이 지연됩니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); } }, 20000);
    void loadYouTubeAPI().then(api => {
      if (cancelled) return;
      const frame = document.createElement('iframe');
      frame.title = '화면 1 유튜브 찬양 플레이어';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture';
      const params = new URLSearchParams({ enablejsapi: '1', origin: location.origin, autoplay: '0', controls: '1', playsinline: '1', rel: '0', start: String(track.startSeconds) });
      frame.src = `https://www.youtube-nocookie.com/embed/${track.videoId}?${params}`;
      mount.appendChild(frame);
      player.current = new api.Player(frame, { events: {
        onReady: () => { if (cancelled) return; ready = true; clearTimeout(timer); setError(''); setStatus('재생 버튼을 눌러 주세요'); },
        onStateChange: event => {
          if (cancelled) return;
          if (event.data === 1 && (hidden.current || !visible || document.visibilityState === 'hidden')) { pause(); return; }
          setStatus(({ 0: '재생 종료', 1: '재생 중', 2: '일시정지', 3: '불러오는 중', 5: '재생 준비' } as Record<number, string>)[event.data] ?? '재생 준비');
        },
        onError: event => { if (!cancelled) { clearTimeout(timer); setError(youtubeError(event.data)); setStatus('재생 불가'); } },
        onAutoplayBlocked: () => { if (!cancelled) setError('유튜브 화면의 재생 버튼을 직접 눌러 주세요.'); },
      } });
    }).catch(err => { if (!cancelled) { clearTimeout(timer); setError(errorText(err)); setStatus('연결 실패'); } });
    const visibility = () => { if (document.visibilityState === 'hidden') pause(); };
    const offline = () => { pause(); setError('인터넷 연결이 끊겼습니다. 유튜브는 온라인에서 재생할 수 있습니다.'); setStatus('오프라인'); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].intersectionRatio >= 0.5; if (!visible) pause(); }, { threshold: [0, 0.5] });
    observer.observe(mount); document.addEventListener('visibilitychange', visibility); window.addEventListener('offline', offline);
    return () => { cancelled = true; clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('offline', offline); pause(); player.current?.destroy(); player.current = null; mount.replaceChildren(); };
  }, [track?.videoId, track?.startSeconds, retry]);
  useEffect(() => { if (suspended) { try { player.current?.pauseVideo(); } catch { /* not ready */ } } }, [suspended]);
  return <section className="audio-card youtube-card" aria-label="유튜브 찬양 플레이어">
    <div className="audio-heading"><div className="album-icon"><Youtube size={23} /></div><div><div className="eyebrow">YOUTUBE · 화면 1에서 재생</div><h3>{title}</h3><p>화면 2에는 연결한 PPT·PDF 가사만 표시됩니다.</p></div></div>
    {track ? <><div ref={host} className="youtube-frame" /><p className="youtube-status" role="status">{status}</p></> : <p className="notice">연결된 유튜브 영상이 없습니다.</p>}
    {error && <div className="notice warning"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>}
    <p className="muted youtube-help">영상의 재생·음량 버튼을 사용하세요. 화면 1의 플레이어를 가리거나 다른 곡으로 이동하면 재생이 멈춥니다.</p>
  </section>;
}
