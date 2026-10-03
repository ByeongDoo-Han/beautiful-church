'use client';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Music2, Pause, Play, Volume2 } from 'lucide-react';
import { fileFor } from '@/lib/client-storage';
import { errorText, type Asset } from '@/lib/model';
const time = (n: number) => Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '0:00';
export type AudioPlayerControls = { toggle: () => void };
export function AudioPlayer({ asset, title, ref }: { asset: Asset | null; title: string; ref?: Ref<AudioPlayerControls> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false); const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0); const [volume, setVolume] = useState(0.7);
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const element = audio.current!; element.pause(); element.removeAttribute('src'); element.load();
    setReady(false); setError(''); setPosition(0); setDuration(0); setPlaying(false);
    if (!asset) return;
    let cancelled = false; let url: string | undefined;
    void fileFor(asset).then(blob => { if (cancelled) return; url = URL.createObjectURL(blob); element.src = url; element.load(); }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; element.pause(); element.removeAttribute('src'); element.load(); if (url) URL.revokeObjectURL(url); };
  }, [asset?.id]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  const toggle = async () => { const el = audio.current!; try { if (el.paused) await el.play(); else el.pause(); } catch { setError('재생을 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요.'); } };
  useImperativeHandle(ref, () => ({ toggle: () => { if (ready) void toggle(); } }));
  return <section className="audio-card" aria-label="찬양 플레이어">
    <audio ref={audio} preload="auto" onCanPlay={() => setReady(true)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onDurationChange={e => setDuration(e.currentTarget.duration)} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (audio.current?.getAttribute('src')) setError('이 음원을 재생할 수 없습니다. MP3 파일을 확인해 주세요.'); }} />
    <div className="audio-heading"><div className="album-icon"><Music2 size={23} /></div><div><div className="eyebrow">AUDIO · 운영자 PC에서 재생</div><h3>{asset ? title : '연결된 찬양 음원이 없습니다'}</h3><p>{asset?.name ?? '자료 편집에서 MP3를 연결하세요'}</p></div><span className={`badge ${playing ? 'green' : ''}`}>{playing ? '재생 중' : ready ? '재생 준비' : '대기'}</span></div>
    <div className="audio-controls"><button className="play-button" aria-keyshortcuts="Space" aria-label={playing ? '찬양 일시정지' : '찬양 재생'} disabled={!ready} onClick={toggle}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><span className="time">{time(position)}</span><input aria-label="찬양 진행바" type="range" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.1" value={position} disabled={!ready} onChange={e => { const n = Number(e.target.value); audio.current!.currentTime = n; setPosition(n); }} /><span className="time">{time(duration)}</span><Volume2 size={18} /><input className="volume" aria-label="찬양 볼륨" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} /><span className="volume-number">{Math.round(volume * 100)}%</span></div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
