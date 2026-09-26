import type { PresentationData } from '@aiden0z/pptx-renderer';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { fileFor } from './client-storage';
import type { Asset } from './model';
export type Deck = { kind: 'pptx'; count: number; presentation: PresentationData; slideXml: string[] } | { kind: 'pdf'; count: number; document: PDFDocumentProxy };
type Entry = { users: number; promise: Promise<Deck>; timer?: ReturnType<typeof setTimeout> };
const decks = new Map<string, Entry>();
export async function rendererModules() { return Promise.all([import('@aiden0z/pptx-renderer'), import('pdfjs-dist')]); }
async function load(asset: Asset): Promise<Deck> {
  const buffer = await (await fileFor(asset)).arrayBuffer();
  if (asset.kind === 'pptx') {
    const pptx = await import('@aiden0z/pptx-renderer');
    const files = await pptx.parseZipLazyMedia(buffer, pptx.RECOMMENDED_ZIP_LIMITS);
    const presentation = pptx.buildPresentation(files, { lazySlides: true });
    if (!presentation.slides.length || presentation.slides.length > 1000) throw new Error('슬라이드는 1~1000장까지 지원합니다.');
    // The renderer consumes sourceXml when materializing a slide. Retain the original
    // separately so edits and copies can always be rendered without mutating the cache.
    return { kind: 'pptx', count: presentation.slides.length, presentation, slideXml: presentation.slides.map(s => s.sourceXml ?? '') };
  }
  if (asset.kind !== 'pdf') throw new Error('프레젠테이션 자료가 아닙니다.');
  const pdf = await import('pdfjs-dist');
  pdf.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const loading = pdf.getDocument({ data: buffer, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/' });
  let document: PDFDocumentProxy;
  try { document = await loading.promise; } catch (e) { await loading.destroy(); throw e; }
  if (!document.numPages || document.numPages > 1000) { await loading.destroy(); throw new Error('PDF는 1~1000쪽까지 지원합니다.'); }
  return { kind: 'pdf', count: document.numPages, document };
}
export function acquireDeck(asset: Asset) {
  let entry = decks.get(asset.id);
  if (!entry) { entry = { users: 0, promise: load(asset) }; decks.set(asset.id, entry); }
  clearTimeout(entry.timer); entry.users++;
  const current = entry;
  return { promise: current.promise, release() {
    current.users--;
    if (!current.users) current.timer = setTimeout(() => {
      if (current.users) return;
      decks.delete(asset.id);
      void current.promise.then(d => { if (d.kind === 'pdf') return d.document.loadingTask.destroy(); }).catch(() => {});
    }, 1500);
  } };
}
