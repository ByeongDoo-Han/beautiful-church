import { describe, expect, it } from 'vitest';
import { demoManifest, manifestSchema, presentationEditSchema, snapshotSchema, initialSnapshot, slideKey } from '../../src/lib/model';
import { createPresentationEdit } from '../../src/lib/slide-edit';

describe('saved presentation edits', () => {
  it('roundtrips copied slides and text through both server and output schemas', () => {
    const edit = createPresentationEdit('demo-pptx', 3);
    edit.slides.splice(1, 0, { ...edit.slides[0], id: crypto.randomUUID(), texts: { 'text-0': '새 가사\n두 번째 줄' } });
    const manifest = { ...demoManifest, items: [{ ...demoManifest.items[0], presentationEdit: edit }] };
    expect(manifestSchema.parse(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    const state = { ...initialSnapshot, asset: demoManifest.assets[0], presentationEdit: edit };
    expect(snapshotSchema.parse(state)).toEqual(state);
    expect(slideKey(state)).not.toBe(slideKey({ ...state, presentationEdit: undefined }));
  });
  it('rejects empty or duplicate slides, invalid sources, oversized text and unsafe keys', () => {
    const edit = createPresentationEdit('demo-pptx', 1);
    for (const slides of [[], [edit.slides[0], edit.slides[0]], [{ ...edit.slides[0], source: 1000 }], [{ ...edit.slides[0], texts: { 'text-0': 'x'.repeat(10001) } }], [{ ...edit.slides[0], texts: { constructor: 'bad' } }]]) expect(presentationEditSchema.safeParse({ ...edit, slides }).success).toBe(false);
  });
  it('binds edits to the card PPTX and accepts older saved libraries', () => {
    expect(manifestSchema.safeParse(demoManifest).success).toBe(true);
    const edit = createPresentationEdit('demo-pptx', 1);
    for (const presentationId of ['demo-pdf', undefined]) expect(manifestSchema.safeParse({ ...demoManifest, items: [{ ...demoManifest.items[0], presentationId, presentationEdit: edit }] }).success).toBe(false);
  });
});
