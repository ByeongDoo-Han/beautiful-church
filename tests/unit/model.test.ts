import { describe, expect, it } from 'vitest';
import { assetSchema, demoManifest, initialSnapshot, manifestSchema, mediaPath, slideIndex } from '../../src/lib/model';
import { newerState } from '../../src/lib/sync';
import { chooseOutputScreen, type DetailedScreen, type ScreenDetails } from '../../src/lib/screens';
describe('presentation invariants', () => {
  it('clamps slide navigation, including empty decks', () => { expect(slideIndex(-1, 3)).toBe(0); expect(slideIndex(10, 3)).toBe(2); expect(slideIndex(1, 0)).toBe(0); });
  it('rejects delayed snapshots after a newer slide is received', () => { const latest = { ...initialSnapshot, revision: 42, slide: 2 }; expect(newerState(latest, { ...latest, revision: 41, slide: 0 })).toBe(latest); expect(newerState(latest, { ...latest, revision: 43, slide: 1 }).slide).toBe(1); });
  it('accepts the demo and rejects broken or wrong-kind references', () => { expect(manifestSchema.safeParse(demoManifest).success).toBe(true); expect(manifestSchema.safeParse({ ...demoManifest, items: [{ id: 'bad', title: 'bad', audioId: 'demo-pdf' }] }).success).toBe(false); });
  it('round-trips independent slide positions and rejects invalid pages or media', () => {
    const value = { ...demoManifest, items: demoManifest.items.map((item, n) => ({ ...item, slidePositions: { 'demo-pptx': n, 'demo-pdf': 2 - n } })) };
    expect(manifestSchema.parse(value)).toEqual(value);
    for (const slidePositions of [{ 'demo-pptx': -1 }, { 'demo-pptx': 1000 }, { 'demo-pptx': 1.5 }, { 'missing': 1 }, { 'demo-mp3': 0 }]) {
      expect(manifestSchema.safeParse({ ...demoManifest, items: [{ ...demoManifest.items[0], slidePositions }] }).success).toBe(false);
    }
  });
  it('rejects duplicate item IDs', () => { expect(manifestSchema.safeParse({ ...demoManifest, items: [demoManifest.items[0], demoManifest.items[0]] }).success).toBe(false); });
  it('rejects arbitrary URLs and path traversal', () => { for (const p of ['https://example.com/a.mp3', 'media/../../secret', 'data/manifest.json', 'media/foo.pptx']) expect(mediaPath.safeParse(p).success).toBe(false); });
  it('binds cloud asset identity to immutable pathname and size limit', () => { const id = 'a'.repeat(64); expect(assetSchema.safeParse({ id, name: 'a.mp3', kind: 'mp3', size: 100, pathname: `media/${id}.mp3` }).success).toBe(true); expect(assetSchema.safeParse({ id, name: 'a.mp3', kind: 'mp3', size: 16 * 1024 ** 2 }).success).toBe(false); expect(assetSchema.safeParse({ id, name: 'a.mp3', kind: 'mp3', size: 100, pathname: `media/${'b'.repeat(64)}.mp3` }).success).toBe(false); });
});
describe('monitor selection', () => {
  const internal = { left: 0, top: 0, isInternal: true } as DetailedScreen;
  const external = { left: -1920, top: 0, isInternal: false } as DetailedScreen;
  it('selects the other screen, including a screen left of the operator', () => { expect(chooseOutputScreen({ currentScreen: internal, screens: [internal, external] } as ScreenDetails)).toBe(external); });
  it('never mistakes primary for the operator screen', () => { expect(chooseOutputScreen({ currentScreen: external, screens: [internal, external] } as ScreenDetails)).toBe(internal); });
  it('falls back when only one screen is available', () => { expect(chooseOutputScreen({ currentScreen: internal, screens: [internal] } as ScreenDetails)).toBeNull(); });
});
