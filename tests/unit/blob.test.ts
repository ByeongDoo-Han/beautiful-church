import { beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), head: vi.fn(), issueSignedToken: vi.fn(), presignUrl: vi.fn() }));
vi.mock('@vercel/blob', () => ({ ...sdk, BlobNotFoundError: class extends Error {}, BlobPreconditionFailedError: class extends Error {} }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
import { readManifest, writeManifest } from '../../src/lib/blob-store';
import { emptyManifest, type Manifest } from '../../src/lib/model';
import { BlobPreconditionFailedError } from '@vercel/blob';
beforeEach(() => vi.resetAllMocks());
const id = 'a'.repeat(64);
const manifest: Manifest = { ...emptyManifest, assets: [{ id, name: 'a.pdf', kind: 'pdf', size: 100, pathname: `media/${id}.pdf` }], items: [{ id: 'first', title: 'First', presentationId: id }] };
const readResult = (m: Manifest, etag: string) => ({ stream: new Blob([JSON.stringify(m)]).stream(), blob: { etag } });
describe('private manifest storage', () => {
  it('bypasses CDN cache for manifest reads', async () => { sdk.get.mockResolvedValue(readResult(manifest, 'v1')); expect((await readManifest()).etag).toBe('v1'); expect(sdk.get).toHaveBeenCalledWith('data/manifest.json', { access: 'private', useCache: false }); });
  it('uses atomic ifMatch to avoid losing a simultaneous edit', async () => { sdk.get.mockResolvedValue(readResult(manifest, 'v1')); sdk.put.mockResolvedValue({ etag: 'v2' }); expect((await writeManifest(manifest, 'v1')).etag).toBe('v2'); expect(sdk.put.mock.calls[0][2]).toMatchObject({ access: 'private', ifMatch: 'v1', addRandomSuffix: false }); expect(sdk.head).not.toHaveBeenCalled(); });
  it('rejects stale revisions before attempting writes', async () => { sdk.get.mockResolvedValue(readResult(manifest, 'v2')); await expect(writeManifest(manifest, 'v1')).rejects.toMatchObject({ status: 409 }); expect(sdk.put).not.toHaveBeenCalled(); });
  it('maps an actual conditional-write race to conflict', async () => { sdk.get.mockResolvedValue(readResult(manifest, 'v1')); sdk.put.mockRejectedValue(new BlobPreconditionFailedError()); await expect(writeManifest(manifest, 'v1')).rejects.toMatchObject({ status: 409 }); });
  it('first creation never permits overwrite, and checks newly referenced files', async () => { sdk.get.mockResolvedValue(null); sdk.head.mockResolvedValue({ size: 100, pathname: `media/${id}.pdf` }); sdk.put.mockResolvedValue({ etag: 'v1' }); await writeManifest(manifest, null); expect(sdk.put.mock.calls[0][2]).toMatchObject({ allowOverwrite: false }); expect(sdk.head).toHaveBeenCalledWith(`media/${id}.pdf`); });
  it('rejects local-only and forged file metadata', async () => { await expect(writeManifest({ ...manifest, assets: [{ ...manifest.assets[0], pathname: undefined }] }, null)).rejects.toMatchObject({ status: 400 }); sdk.get.mockResolvedValue(null); sdk.head.mockResolvedValue({ size: 999, pathname: `media/${id}.pdf` }); await expect(writeManifest(manifest, null)).rejects.toMatchObject({ status: 400 }); });
});
