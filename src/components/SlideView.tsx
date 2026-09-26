'use client';
import { useEffect, useRef, useState } from 'react';
import { acquireDeck } from '@/lib/decks';
import { errorText, type Asset, type PresentationEdit } from '@/lib/model';
import { editedSlide } from '@/lib/slide-edit';

export function SlideView({ asset, index, edit, label, onReady, onError }: { asset: Asset | null; index: number; edit?: PresentationEdit; label: string; onReady?: (count: number) => void; onError?: (error: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onError }); callbacks.current = { onReady, onError };
  const [status, setStatus] = useState('');
  useEffect(() => {
    const host = root.current!; host.replaceChildren();
    if (!asset) return;
    let cancelled = false; let dispose = () => {}; let observer: ResizeObserver | undefined;
    const resource = acquireDeck(asset); setStatus('자료를 준비하고 있습니다…');
    void (async () => {
      const deck = await resource.promise; if (cancelled) return;
      const effectiveEdit = deck.kind === 'pptx' && edit?.assetId === asset.id ? edit : undefined;
      const count = effectiveEdit?.slides.length ?? deck.count;
      if (index >= count) { setStatus('마지막 슬라이드입니다'); callbacks.current.onReady?.(count); return; }
      const entry = effectiveEdit?.slides[index];
      const source = entry?.source ?? index;
      if (source >= deck.count) throw new Error('편집한 슬라이드의 원본을 찾을 수 없습니다.');
      const stage = document.createElement('div'); stage.className = 'slide-stage'; stage.style.visibility = 'hidden';
      host.appendChild(stage);
      let width: number; let height: number;
      if (deck.kind === 'pptx') {
        const { renderSlide } = await import('@aiden0z/pptx-renderer'); if (cancelled) return;
        let nodeError = false;
        const slide = entry ? editedSlide(deck.presentation.slides[source], deck.slideXml[source], entry) : deck.presentation.slides[source];
        const handle = renderSlide(deck.presentation, slide, {
          pdfjs: { moduleUrl: '/vendor/pdfjs/pdf.min.mjs', workerUrl: '/vendor/pdfjs/pdf.worker.min.mjs' },
          onNavigate: () => {}, onNodeError: () => { nodeError = true; },
        });
        dispose = () => handle.dispose(); stage.appendChild(handle.element);
        width = deck.presentation.width; height = deck.presentation.height;
        await handle.ready;
        if (nodeError && !cancelled) callbacks.current.onError?.('일부 PPTX 요소를 표시하지 못했습니다. PDF 전환을 권장합니다.');
      } else {
        const page = await deck.document.getPage(index + 1); if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        // Cap raster dimensions to keep projector canvases within a bounded memory footprint.
        const scale = Math.min(2.5, 2560 / base.width, 1440 / base.height);
        const viewport = page.getViewport({ scale }); width = viewport.width; height = viewport.height;
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height); stage.appendChild(canvas);
        const task = page.render({ canvas, viewport }); dispose = () => { task.cancel(); canvas.width = 0; canvas.height = 0; };
        await task.promise;
      }
      if (cancelled) return;
      stage.style.width = `${width}px`; stage.style.height = `${height}px`;
      const fit = () => { const scale = Math.min(host.clientWidth / width, host.clientHeight / height); stage.style.transform = `translate(-50%, -50%) scale(${scale})`; };
      observer = new ResizeObserver(fit); observer.observe(host); fit();
      stage.style.visibility = 'visible'; setStatus(''); callbacks.current.onReady?.(count);
    })().catch(e => { if (!cancelled) { const message = errorText(e); setStatus('자료를 표시하지 못했습니다'); callbacks.current.onError?.(message); } });
    return () => { cancelled = true; observer?.disconnect(); dispose(); resource.release(); host.replaceChildren(); };
  }, [asset?.id, index, edit?.version]); // assets are immutable; edit versions invalidate the rendered slide
  return <div className="slide-frame" role="img" aria-label={label}>
    <div ref={root} className="slide-host" />
    {(!asset || status) && <div className="slide-placeholder">{asset ? status : '프레젠테이션을 선택해 주세요'}</div>}
  </div>;
}
