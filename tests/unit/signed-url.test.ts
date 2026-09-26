import { beforeEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ requireAdmin: vi.fn(), readManifest: vi.fn(), issueSignedToken: vi.fn(), presignUrl: vi.fn() }));
vi.mock('@vercel/blob', () => ({ issueSignedToken: mocked.issueSignedToken, presignUrl: mocked.presignUrl }));
vi.mock('../../src/lib/blob-store', () => ({ readManifest: mocked.readManifest }));
vi.mock('../../src/lib/auth', async importOriginal => ({ ...await importOriginal<object>(), requireAdmin: mocked.requireAdmin, cloudConfigured: () => true }));
import { GET } from '../../src/app/api/signed-url/route';
beforeEach(() => vi.resetAllMocks());
it('returns only a five-minute GET URL scoped to a manifest asset', async () => {
  const pathname = `media/${'a'.repeat(64)}.pdf`; const now = Date.now();
  mocked.readManifest.mockResolvedValue({ manifest: { assets: [{ id: 'asset', pathname }] } });
  mocked.issueSignedToken.mockResolvedValue({ delegationToken: 'public-delegation', clientSigningToken: 'secret-signing-key' });
  mocked.presignUrl.mockResolvedValue({ presignedUrl: 'https://example.private.blob.vercel-storage.com/file?signed' });
  const r = await GET(new Request('http://localhost/api/signed-url?id=asset')); const body = await r.json();
  expect(mocked.requireAdmin).toHaveBeenCalled(); expect(mocked.issueSignedToken.mock.calls[0][0]).toMatchObject({ pathname, operations: ['get'] });
  expect(body.expiresAt).toBeGreaterThanOrEqual(now + 300000); expect(body.expiresAt).toBeLessThan(now + 301000);
  expect(body.url).toEqual('https://example.private.blob.vercel-storage.com/file?signed'); expect(JSON.stringify(body)).not.toContain('secret-signing-key');
  expect(mocked.presignUrl.mock.calls[0][1]).toMatchObject({ operation: 'get', pathname, access: 'private' });
});
it('never signs arbitrary unregistered paths', async () => { mocked.readManifest.mockResolvedValue({ manifest: { assets: [] } }); const r = await GET(new Request('http://localhost/api/signed-url?id=../../data/manifest.json')); expect(r.status).toBe(404); expect(mocked.issueSignedToken).not.toHaveBeenCalled(); });
