'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const storageKey = 'worship-sidebar-ratio';
const dividerWidth = 12;

export function ResizableWorkspace({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; offset: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0 && saved < 1) setRatio(saved);
    } catch { /* Resizing still works if browser storage is unavailable. */ }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(shell.current!);
    return () => observer.disconnect();
  }, []);

  const available = Math.max(1, width - dividerWidth);
  const minimum = width > 900 ? 220 : 190;
  const maximum = Math.max(minimum, Math.min(available * 0.6, available - 380));
  const defaultWidth = width > 1250 ? 264 : width > 900 ? 230 : 190;
  const clamp = (value: number) => Math.max(minimum, Math.min(maximum, value));
  const left = clamp(ratio === null ? defaultWidth : ratio * available);
  const percent = (value: number) => Math.round(value / available * 100);
  const resize = (value: number) => {
    const next = clamp(value) / available;
    setRatio(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* session only */ }
  };
  const reset = () => {
    setRatio(null);
    try { localStorage.removeItem(storageKey); } catch { /* session only */ }
  };

  return <div ref={shell} className={`app-shell resizable-workspace${dragging ? ' resizing' : ''}`}
    style={width ? { '--sidebar-width': `${left}px` } as CSSProperties : undefined}>
    {sidebar}
    <div className="workspace-divider" role="separator" tabIndex={0} aria-label="왼쪽·오른쪽 영역 비율 조절"
      aria-orientation="vertical" aria-controls="worship-sidebar" aria-describedby="workspace-resize-help"
      aria-valuemin={percent(minimum)} aria-valuemax={percent(maximum)} aria-valuenow={percent(left)}
      aria-valuetext={`왼쪽 ${percent(left)}%, 오른쪽 ${100 - percent(left)}%`}
      title="드래그로 너비 조절 · 더블클릭으로 초기화" onDoubleClick={reset}
      onPointerDown={e => {
        if (e.button !== 0 || !e.isPrimary || width <= 600) return;
        e.preventDefault(); e.currentTarget.focus({ preventScroll: true });
        gesture.current = { pointerId: e.pointerId, offset: e.clientX - shell.current!.getBoundingClientRect().left - left };
        e.currentTarget.setPointerCapture(e.pointerId); setDragging(true);
      }}
      onPointerMove={e => {
        if (gesture.current?.pointerId !== e.pointerId) return;
        resize(e.clientX - shell.current!.getBoundingClientRect().left - gesture.current.offset);
      }}
      onPointerUp={e => {
        if (gesture.current?.pointerId !== e.pointerId) return;
        gesture.current = null; setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={() => { gesture.current = null; setDragging(false); }}
      onPointerCancel={() => { gesture.current = null; setDragging(false); }}
      onKeyDown={e => {
        // Do not let the operator's slide shortcuts consume splitter keys.
        e.stopPropagation();
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'Enter') reset();
        else resize(e.key === 'Home' ? minimum : e.key === 'End' ? maximum : left + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 50 : 10));
      }}>
      <span className="divider-grip" aria-hidden="true" />
      <span className="divider-ratio" aria-hidden="true">{percent(left)} : {100 - percent(left)}</span>
      <span id="workspace-resize-help" className="sr-only">드래그 또는 좌우 방향키로 너비를 조절합니다. 더블클릭 또는 Enter로 기본 너비로 돌아갑니다.</span>
    </div>
    {children}
  </div>;
}
