import type { SlideData } from '@aiden0z/pptx-renderer';
import type { EditedSlide, PresentationEdit } from './model';

const DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRESENTATION = 'http://schemas.openxmlformats.org/presentationml/2006/main';
function parse(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('슬라이드 문구를 읽지 못했습니다.');
  return doc;
}
function bodies(doc: Document) {
  return Array.from(doc.getElementsByTagNameNS('*', 'txBody')).filter(e => [DRAWING, PRESENTATION].includes(e.namespaceURI ?? ''));
}
function paragraphs(body: Element) { return Array.from(body.children).filter(e => e.namespaceURI === DRAWING && e.localName === 'p'); }
function paragraphText(p: Element) {
  return Array.from(p.getElementsByTagNameNS(DRAWING, '*')).filter(e => e.localName === 't' || e.localName === 'br').map(e => e.localName === 'br' ? '\n' : e.textContent ?? '').join('');
}
export function textFields(xml: string) {
  return bodies(parse(xml)).map((body, index) => ({ key: `text-${index}`, text: paragraphs(body).map(paragraphText).join('\n') }));
}

/** Change text in a fresh XML document, including grouped shapes and table cells.
 * Untouched paragraphs retain every original run. Changed paragraphs retain their
 * paragraph properties and the first run's font, size and color. No HTML is used. */
export function editedXml(xml: string, texts: EditedSlide['texts']) {
  if (!Object.keys(texts).length) return xml;
  const doc = parse(xml);
  bodies(doc).forEach((body, index) => {
    const value = texts[`text-${index}`];
    if (value === undefined) return;
    const original = paragraphs(body);
    if (value === original.map(paragraphText).join('\n')) return;
    const replacements = value.split('\n').map((line, lineIndex) => {
      const template = original[Math.min(lineIndex, original.length - 1)];
      if (template && line === paragraphText(template)) return template.cloneNode(true);
      const paragraph = template ? template.cloneNode(true) as Element : doc.createElementNS(DRAWING, 'a:p');
      const properties = paragraph.getElementsByTagNameNS(DRAWING, 'rPr')[0]?.cloneNode(true);
      for (const child of Array.from(paragraph.children)) if (!['pPr', 'endParaRPr'].includes(child.localName)) child.remove();
      const run = doc.createElementNS(DRAWING, 'a:r');
      if (properties) run.appendChild(properties);
      const text = doc.createElementNS(DRAWING, 'a:t'); text.textContent = line; run.appendChild(text);
      const end = Array.from(paragraph.children).find(e => e.localName === 'endParaRPr');
      paragraph.insertBefore(run, end ?? null);
      return paragraph;
    });
    original.forEach(p => p.remove()); replacements.forEach(p => body.appendChild(p));
  });
  return new XMLSerializer().serializeToString(doc);
}
export function editedSlide(source: SlideData, xml: string, edit: EditedSlide): SlideData {
  return { ...source, nodes: [], nodesMaterialized: false, placeholderInheritanceResolved: false, sourceXml: editedXml(xml, edit.texts) };
}
export function createPresentationEdit(assetId: string, count: number): PresentationEdit {
  return { assetId, version: crypto.randomUUID(), slides: Array.from({ length: count }, (_, source) => ({ id: crypto.randomUUID(), source, texts: {} })) };
}
