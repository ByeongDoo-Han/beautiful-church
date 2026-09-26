import { expect, it, vi } from 'vitest';
import type * as BlobSDK from '@vercel/blob';
import { emptyManifest, type Manifest } from '../../src/lib/model';

const isolated = vi.hoisted(() => ({ path: `diagnostics/slide-save-${crypto.randomUUID()}.json` }));
vi.mock('@vercel/blob', async importOriginal => {
  const sdk = await importOriginal<typeof BlobSDK>();
  const remap = (path: string) => {
    if (path !== 'data/manifest.json') throw new Error('Unexpected manifest path');
    return isolated.path;
  };
  return {
    ...sdk,
    get: (path: string, options: Parameters<typeof sdk.get>[1]) => sdk.get(remap(path), options),
    put: (path: string, body: Parameters<typeof sdk.put>[1], options: Parameters<typeof sdk.put>[2]) => sdk.put(remap(path), body, options),
  };
});
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
import { readManifest, writeManifest } from '../../src/lib/blob-store';

it('persists changed slide text to real storage and rejects stale drafts', async () => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Run explicitly with a Blob token; this test only writes a unique diagnostics object.');
  const sdk = await vi.importActual<typeof BlobSDK>('@vercel/blob');
  const assetId = 'a'.repeat(64);
  // Existing asset metadata suffices: this test edits text and never uploads or changes source files.
  const initial: Manifest = {
    ...emptyManifest,
    assets: [{ id: assetId, name: 'test.pptx', kind: 'pptx', size: 100, pathname: `media/${assetId}.pptx` }],
    items: [{ id: 'first', title: '저장 검증' }],
    sections: [{ id: 'section-1', itemIds: ['first'], presentationId: assetId, presentationEdit: {
      assetId, version: crypto.randomUUID(), slides: [{ id: 'slide-1', source: 0, texts: { 'text-0': '이전 문구 '.repeat(300) } }],
    } }],
  };
  const created = await sdk.put(isolated.path, JSON.stringify(initial), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
  let cleanupEtag = created.etag;
  try {
    const compressed = await sdk.get(isolated.path, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'gzip' } });
    expect(compressed?.blob.etag).toBe(`W/${created.etag}`);
    if (compressed?.stream) await new Response(compressed.stream).arrayBuffer();
    const loaded = await readManifest();
    expect(loaded.etag).toBe(created.etag);
    const changed = structuredClone(loaded.manifest);
    changed.sections![0].presentationEdit!.version = crypto.randomUUID();
    changed.sections![0].presentationEdit!.slides[0].texts['text-0'] = '서버에 저장한 새 슬라이드 문구';
    const saved = await writeManifest(changed, compressed!.blob.etag);
    cleanupEtag = saved.etag;
    expect(await readManifest()).toEqual(saved);
    expect(saved.manifest).toEqual(changed);
    await expect(writeManifest(initial, loaded.etag)).rejects.toMatchObject({ status: 409 });
    expect((await readManifest()).manifest).toEqual(changed);
  } finally {
    await sdk.del(isolated.path, { ifMatch: cleanupEtag });
  }
});
