import { describe, expect, it } from 'vitest';
import { demoManifest, manifestSchema, type Manifest } from '../../src/lib/model';
import { appendCard, currentSection, moveCard, moveSection, patchSection, removeCard, sectionName, sectionFileName, withSections } from '../../src/lib/sections';
import { createPresentationEdit } from '../../src/lib/slide-edit';

describe('PPT sections', () => {
  it('persists a section name separately from its file and slide edits', () => {
    const base = withSections(demoManifest);
    expect(sectionName(base, base.sections[0])).toBe('PPT 섹션 1');
    const edit = createPresentationEdit('demo-pptx', 3);
    const named = manifestSchema.parse(patchSection(base, 'welcome', { title: '찬양', presentationEdit: edit }));
    const moved = moveSection(named, 'welcome', 1);
    const section = moved.sections![1];
    expect(sectionName(moved, section)).toBe('찬양');
    expect(sectionFileName(moved, section)).toBe('예배 안내.pptx');
    expect(section.presentationEdit).toEqual(edit);
    expect(section.itemIds).toEqual(['welcome']);
  });
  it('adds blank and audio cards without multiplying sections or losing presentation edits', () => {
    const edit = createPresentationEdit('demo-pptx', 3);
    const base: Manifest = { ...demoManifest, sections: [{ id: 'service', presentationId: 'demo-pptx', presentationEdit: edit, itemIds: demoManifest.items.map(i => i.id) }] };
    let value = appendCard(base, { id: 'blank', title: '빈 순서' });
    value = appendCard(value, { id: 'audio', title: '음원', audioId: 'demo-mp3' });
    expect(value.sections).toHaveLength(1);
    expect(value.sections?.[0]).toEqual({ ...base.sections![0], itemIds: ['welcome', 'praise', 'prayer', 'blank', 'audio'] });
    expect(currentSection(value, 'audio')?.owner.presentationEdit).toEqual(edit);
    expect(manifestSchema.safeParse(value).success).toBe(true);
    value = appendCard(value, { id: 'new-ppt', title: '새 PPT', presentationId: 'demo-pptx' });
    expect(value.sections).toHaveLength(2);
    expect(value.sections?.[1].itemIds).toEqual(['new-ppt']);
    expect(value.sections?.[0].presentationEdit).toEqual(edit);
  });
  it('creates only the first section when adding cards to an empty service', () => {
    let value: Manifest = { ...demoManifest, items: [], sections: [] };
    value = appendCard(value, { id: 'one', title: '첫 순서', audioId: 'demo-mp3' });
    value = appendCard(value, { id: 'two', title: '둘째 순서' });
    expect(value.sections).toHaveLength(1);
    expect(value.sections?.[0].itemIds).toEqual(['one', 'two']);
    expect(manifestSchema.safeParse(value).success).toBe(true);
  });
  it('migrates legacy ranges without losing hidden card settings, audio, or text edits', () => {
    const edit = createPresentationEdit('demo-pptx', 3); edit.slides[0].texts['text-0'] = '수정 문구';
    const legacy: Manifest = { ...demoManifest, items: demoManifest.items.map((i, n) => n === 0 ? { ...i, slideHoldCount: 3, presentationEdit: edit } : i) };
    const migrated = withSections(legacy);
    expect(migrated.sections).toHaveLength(1); expect(migrated.sections[0].itemIds).toEqual(['welcome', 'praise', 'prayer']);
    expect(migrated.sections[0].presentationEdit).toEqual(edit); expect(migrated.items).toEqual(legacy.items);
    expect(manifestSchema.parse(migrated)).toEqual(migrated);
    expect(withSections(migrated)).toEqual(migrated); expect(legacy.sections).toBeUndefined();
  });
  it('moves and reorders cards exactly once, preserving section files and independent item audio', () => {
    const start = withSections(demoManifest);
    const next = moveCard(moveCard(start, 'prayer', 'welcome'), 'praise', 'welcome', 'welcome');
    expect(next.items.map(i => i.id)).toEqual(['praise', 'welcome', 'prayer']);
    expect(next.items[0].audioId).toBe('demo-mp3');
    expect(currentSection(next, 'prayer')?.owner.presentationId).toBe('demo-pptx');
    expect(next.sections?.[2].presentationId).toBe('demo-pdf'); expect(next.sections?.[2].itemIds).toEqual([]);
    expect(manifestSchema.safeParse(next).success).toBe(true); expect(start.items).toEqual(demoManifest.items);
  });
  it('moving or deleting the original first card does not remove section edits', () => {
    const edit = createPresentationEdit('demo-pptx', 3);
    let value = patchSection(withSections(demoManifest), 'welcome', { presentationEdit: edit });
    value = moveCard(value, 'praise', 'welcome'); value = moveCard(value, 'welcome', 'prayer');
    expect(currentSection(value, 'praise')?.owner.presentationEdit).toEqual(edit);
    expect(currentSection(value, 'welcome')?.owner.presentationId).toBe('demo-pdf');
    value = removeCard(value, 'praise');
    expect(value.sections?.[0].presentationEdit).toEqual(edit); expect(value.sections?.[0].itemIds).toEqual([]);
    expect(manifestSchema.safeParse(value).success).toBe(true);
  });
  it('supports empty destinations, card insertion, section ordering and invalid drops', () => {
    let value: Manifest = withSections(demoManifest);
    value = { ...value, sections: [...value.sections!, { id: 'empty', itemIds: [], presentationId: 'demo-pdf' }] };
    value = appendCard(value, { id: 'new', title: '새 순서' }, 'empty');
    value = moveSection(value, 'empty', -1);
    expect(value.items.map(i => i.id)).toEqual(['welcome', 'praise', 'new', 'prayer']);
    for (const [id, section, before] of [['new', 'missing', undefined], ['missing', 'empty', undefined], ['new', 'empty', 'welcome'], ['new', 'empty', 'new']]) expect(moveCard(value, id!, section!, before)).toEqual(value);
    expect(manifestSchema.safeParse(value).success).toBe(true);
  });
  it('rejects duplicate, missing, unknown and out-of-order card membership and wrong file types', () => {
    const base = withSections(demoManifest);
    for (const ids of [['welcome', 'welcome'], [], ['unknown'], ['praise', 'welcome']]) {
      const sections = base.sections.map((s, n) => n === 0 ? { ...s, itemIds: ids } : s);
      expect(manifestSchema.safeParse({ ...base, sections }).success).toBe(false);
    }
    expect(manifestSchema.safeParse({ ...base, sections: base.sections.map(s => ({ ...s, id: 'same' })) }).success).toBe(false);
    expect(manifestSchema.safeParse(patchSection(base, 'welcome', { presentationId: 'demo-mp3' })).success).toBe(false);
  });
  it('keeps web edits until the section source file is replaced', () => {
    const edited = patchSection(withSections(demoManifest), 'welcome', { presentationEdit: createPresentationEdit('demo-pptx', 3) });
    expect(patchSection(edited, 'welcome', { fallbackPdfId: 'demo-pdf' }).sections?.[0].presentationEdit).toBeDefined();
    expect(patchSection(edited, 'welcome', { presentationId: 'demo-pdf' }).sections?.[0].presentationEdit).toBeUndefined();
  });
});
