import { describe, expect, it } from 'vitest';
import { demoManifest, itemSchema, manifestSchema, snapshotSchema, initialSnapshot } from '../../src/lib/model';
import { presentationRange } from '../../src/lib/presentation-range';

describe('service slide ranges', () => {
  it('counts the starting card and resolves direct or backward selection consistently', () => {
    const items = [...demoManifest.items.map(i => ({ ...i })), { id: 'end', title: '마지막', presentationId: 'demo-pptx' }];
    items[0].slideHoldCount = 3;
    for (const [index, item] of items.entries()) {
      const range = presentationRange(items, item.id)!;
      expect(range.owner.id).toBe(index < 3 ? 'welcome' : 'end');
      expect(range.position).toBe(index < 3 ? index + 1 : 1);
    }
  });
  it('the covering range wins even when an inner card has its own range and file', () => {
    const items = demoManifest.items.map(i => ({ ...i }));
    items[0].slideHoldCount = 2; items[1].slideHoldCount = 3;
    expect(presentationRange(items, 'praise')?.owner.id).toBe('welcome');
    expect(presentationRange(items, 'prayer')?.owner.id).toBe('prayer');
  });
  it('follows ordering and clamps at the end; no presentation means no hold', () => {
    const items = demoManifest.items.map(i => ({ ...i })); items[0].slideHoldCount = 100;
    expect(presentationRange(items, 'prayer')?.end).toBe(2);
    expect(presentationRange([items[2], items[0], items[1]], 'prayer')?.owner.id).toBe('prayer');
    items[0].presentationId = undefined;
    expect(presentationRange(items, 'praise')?.owner.id).toBe('praise');
    expect(presentationRange([], 'missing')).toBeUndefined();
    expect(presentationRange(items, 'missing')?.owner.id).toBe('welcome');
  });
  it('preserves old libraries and validates persisted settings and snapshot owner', () => {
    expect(manifestSchema.safeParse(demoManifest).success).toBe(true);
    for (const n of [0, -1, 1.5, 101]) expect(itemSchema.safeParse({ ...demoManifest.items[0], slideHoldCount: n }).success).toBe(false);
    const value = { ...demoManifest, items: [{ ...demoManifest.items[0], slideHoldCount: 3 }] };
    expect(manifestSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(snapshotSchema.parse({ ...initialSnapshot, presentationOwnerId: 'welcome' }).presentationOwnerId).toBe('welcome');
  });
});
