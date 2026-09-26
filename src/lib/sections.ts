import type { Item, Manifest, PresentationSection } from './model';
import { presentationRange } from './presentation-range';

/** One-time, lossless conversion of legacy hold ranges. Identical filenames may
 * have separate sections because their edits or position in the service differ. */
export function withSections(manifest: Manifest): Manifest & { sections: PresentationSection[] } {
  if (manifest.sections) return { ...manifest, sections: manifest.sections };
  const sections: PresentationSection[] = [];
  for (let start = 0; start < manifest.items.length;) {
    const range = presentationRange(manifest.items, manifest.items[start].id)!;
    const owner = range.owner;
    sections.push({ id: owner.id, presentationId: owner.presentationId, fallbackPdfId: owner.fallbackPdfId, presentationEdit: owner.presentationEdit, itemIds: manifest.items.slice(start, range.end + 1).map(i => i.id) });
    start = range.end + 1;
  }
  return { ...manifest, sections };
}
export function sectionName(manifest: Manifest, section: PresentationSection) {
  return manifest.assets.find(a => a.id === section.presentationId)?.name ?? '자료 미지정';
}
export function currentSection(manifest: Manifest, selectedId?: string) {
  const value = withSections(manifest);
  const itemId = value.items.find(i => i.id === selectedId)?.id ?? value.items[0]?.id;
  const section = value.sections.find(s => s.itemIds.includes(itemId ?? ''));
  if (!section) return undefined;
  return { owner: { ...section, title: sectionName(value, section) }, count: section.itemIds.length, position: section.itemIds.indexOf(itemId!) + 1 };
}
function ordered(manifest: Manifest, sections: PresentationSection[]): Manifest {
  const items = new Map(manifest.items.map(item => [item.id, item]));
  return { ...manifest, sections, items: sections.flatMap(s => s.itemIds.map(id => items.get(id)!)) };
}
export function moveCard(manifest: Manifest, itemId: string, sectionId: string, beforeId?: string): Manifest {
  const value = withSections(manifest);
  const target = value.sections.find(s => s.id === sectionId);
  if (!target || !value.items.some(i => i.id === itemId) || beforeId === itemId || (beforeId && !target.itemIds.includes(beforeId))) return value;
  const sections = value.sections.map(s => ({ ...s, itemIds: s.itemIds.filter(id => id !== itemId) }));
  const destination = sections.find(s => s.id === sectionId)!;
  const index = beforeId ? destination.itemIds.indexOf(beforeId) : destination.itemIds.length;
  destination.itemIds.splice(index, 0, itemId);
  return ordered(value, sections);
}
export function moveSection(manifest: Manifest, id: string, delta: number): Manifest {
  const value = withSections(manifest); const sections = [...value.sections];
  const i = sections.findIndex(s => s.id === id); const next = i + delta;
  if (i < 0 || next < 0 || next >= sections.length) return value;
  [sections[i], sections[next]] = [sections[next], sections[i]];
  return ordered(value, sections);
}
export function appendCard(manifest: Manifest, item: Item, sectionId?: string): Manifest {
  const value = withSections(manifest);
  if (value.items.length >= 100) throw new Error('예배 순서는 최대 100개입니다.');
  if (value.items.some(i => i.id === item.id)) return value;
  let sections = value.sections;
  if (sectionId && sections.some(s => s.id === sectionId)) sections = sections.map(s => s.id === sectionId ? { ...s, itemIds: [...s.itemIds, item.id] } : s);
  else {
    if (sections.length >= 100) throw new Error('PPT 섹션은 최대 100개입니다.');
    sections = [...sections, { id: crypto.randomUUID(), presentationId: item.presentationId, fallbackPdfId: item.fallbackPdfId, presentationEdit: item.presentationEdit, itemIds: [item.id] }];
  }
  return ordered({ ...value, items: [...value.items, item] }, sections);
}
export function removeCard(manifest: Manifest, itemId: string): Manifest {
  const value = withSections(manifest);
  return { ...value, items: value.items.filter(i => i.id !== itemId), sections: value.sections.map(s => ({ ...s, itemIds: s.itemIds.filter(id => id !== itemId) })) };
}
export function patchSection(manifest: Manifest, sectionId: string, patch: Partial<PresentationSection>): Manifest {
  const value = withSections(manifest);
  return { ...value, sections: value.sections.map(s => s.id === sectionId ? { ...s, ...patch, ...('presentationId' in patch && patch.presentationId !== s.presentationId ? { presentationEdit: undefined } : {}) } : s) };
}
