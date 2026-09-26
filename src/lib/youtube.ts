export type YouTubeTrack = { videoId: string; startSeconds: number };
export function parseYouTubeLink(input: string): YouTubeTrack | null {
  try {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be' && parts.length === 1) videoId = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      else if (parts.length === 2 && ['embed', 'shorts', 'live'].includes(parts[0])) videoId = parts[1];
    }
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
    const raw = url.searchParams.get('t') ?? url.searchParams.get('start') ?? '0';
    let startSeconds = 0;
    if (/^\d+$/.test(raw)) startSeconds = Number(raw);
    else {
      const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
      if (!match || !raw) return null;
      startSeconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
    }
    if (!Number.isSafeInteger(startSeconds) || startSeconds > 86400) return null;
    return { videoId, startSeconds };
  } catch { return null; }
}

export interface YouTubePlayerInstance {
  pauseVideo(): void;
  destroy(): void;
}
type PlayerEvent = { target: YouTubePlayerInstance; data: number };
type YouTubeAPI = { Player: new (element: HTMLIFrameElement, options: { events: {
  onReady: (event: PlayerEvent) => void;
  onStateChange: (event: PlayerEvent) => void;
  onError: (event: PlayerEvent) => void;
  onAutoplayBlocked: () => void;
} }) => YouTubePlayerInstance };
declare global { interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void } }
let pending: Promise<YouTubeAPI> | undefined;
export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    const previous = window.onYouTubeIframeAPIReady;
    const clean = () => { clearTimeout(timer); if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous; };
    const fail = () => { clean(); script.remove(); reject(new Error('유튜브에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')); };
    const ready = () => { clean(); previous?.(); if (window.YT?.Player) resolve(window.YT); else fail(); };
    const timer = setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = ready; script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function youtubeError(code: number) {
  if (code === 100) return '삭제되었거나 비공개인 영상입니다. 다른 유튜브 링크를 연결해 주세요.';
  if (code === 101 || code === 150) return '이 영상은 외부 사이트 재생이 허용되지 않습니다. 다른 영상이나 MP3를 선택해 주세요.';
  if (code === 153) return '유튜브가 재생 사이트를 확인하지 못했습니다. 브라우저의 개인정보 보호 설정을 확인해 주세요.';
  return '유튜브 영상을 재생할 수 없습니다. 링크와 인터넷 연결을 확인해 주세요.';
}
