'use client';
import { useEffect, useState } from 'react';
import { parseYouTubeLink, type YouTubeTrack } from '@/lib/youtube';
export function YouTubeLinkField({ title, track, disabled = false, onChange }: { title: string; track?: YouTubeTrack; disabled?: boolean; onChange: (track?: YouTubeTrack) => void }) {
  const saved = track ? `https://www.youtube.com/watch?v=${track.videoId}${track.startSeconds ? `&t=${track.startSeconds}` : ''}` : '';
  const [value, setValue] = useState(saved); const [error, setError] = useState('');
  useEffect(() => { setValue(saved); setError(''); }, [saved]);
  return <div className="youtube-link-field"><label>유튜브 링크<input aria-label={`${title} 유튜브 링크`} disabled={disabled} type="url" placeholder="https://www.youtube.com/watch?v=…" value={value} onChange={event => { setValue(event.target.value); setError(''); }} /></label><button disabled={disabled || value === saved} onClick={() => {
    if (!value.trim()) { onChange(undefined); setValue(''); setError(''); return; }
    const parsed = parseYouTubeLink(value);
    if (!parsed) { setError('재생할 영상의 유튜브 링크를 입력해 주세요.'); return; }
    onChange(parsed); setValue(`https://www.youtube.com/watch?v=${parsed.videoId}${parsed.startSeconds ? `&t=${parsed.startSeconds}` : ''}`); setError('');
  }}>링크 적용</button>
  {error && <p className="error" role="alert">{error}</p>}
  <small>{value !== saved ? '링크 적용을 누르면 영상에 반영됩니다. 서버에 저장하려면 서버 저장을 눌러 주세요.' : track ? `링크 연결됨 · ${track.startSeconds}초부터 재생 · 화면 1에만 표시` : '링크를 붙여 넣고 링크 적용을 눌러 주세요.'}</small></div>;
}
