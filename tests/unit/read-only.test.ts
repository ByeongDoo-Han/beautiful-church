import { beforeEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ requireAdmin: vi.fn(), readManifest: vi.fn(), writeManifest: vi.fn(), issueSignedToken: vi.fn(), presignUrl: vi.fn(), list: vi.fn() }));
vi.mock('@vercel/blob', () => ({ issueSignedToken: mocked.issueSignedToken, presignUrl: mocked.presignUrl, list: mocked.list }));
vi.mock('@vercel/blob/client', () => ({ handleUpload: async (options: { onBeforeGenerateToken: (path: string) => Promise<unknown> }) => options.onBeforeGenerateToken(`media/${'a'.repeat(64)}.pptx`) }));
vi.mock('../../src/lib/blob-store', () => ({ readManifest: mocked.readManifest, writeManifest: mocked.writeManifest }));
vi.mock('../../src/lib/auth', async original => ({ ...await original<object>(), cloudConfigured: () => true, requireAdmin: mocked.requireAdmin }));
import { GET, PUT } from '../../src/app/api/manifest/route';
import { GET as signedUrl } from '../../src/app/api/signed-url/route';
import { POST as upload } from '../../src/app/api/upload/route';
import { HttpError } from '../../src/lib/auth';
import { emptyManifest } from '../../src/lib/model';
const asset = { id: 'a'.repeat(64), name: 'published.pptx', kind: 'pptx', size: 100, pathname: `media/${'a'.repeat(64)}.pptx` };
beforeEach(() => {
  vi.resetAllMocks();
  mocked.requireAdmin.mockRejectedValue(new HttpError(401, '로그인이 필요합니다.'));
  mocked.readManifest.mockResolvedValue({ manifest: { ...emptyManifest, assets: [asset] }, etag: 'published' });
});
it('rejects guest reads before accessing the published manifest', async () => {
  expect((await GET()).status).toBe(401);
  expect(mocked.readManifest).not.toHaveBeenCalled();
});
it('serves the published manifest only after authentication without shared caching', async () => {
  mocked.requireAdmin.mockResolvedValue(undefined);
  const response = await GET();
  expect(response.status).toBe(200); expect((await response.json()).etag).toBe('published');
  expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(mocked.requireAdmin).toHaveBeenCalled();
});
it('rejects guest signed downloads before reading storage or issuing tokens', async () => {
  expect((await signedUrl(new Request(`https://church.example/api/signed-url?id=${asset.id}`))).status).toBe(401);
  expect(mocked.readManifest).not.toHaveBeenCalled(); expect(mocked.issueSignedToken).not.toHaveBeenCalled();
});
it('permits authenticated downloads only for files registered in the published manifest', async () => {
  mocked.requireAdmin.mockResolvedValue(undefined);
  mocked.issueSignedToken.mockResolvedValue('read-token'); mocked.presignUrl.mockResolvedValue({ presignedUrl: 'https://blob.example/read' });
  const response = await signedUrl(new Request(`https://church.example/api/signed-url?id=${asset.id}`));
  expect(response.status).toBe(200); expect((await response.json()).url).toBe('https://blob.example/read');
  expect(mocked.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({ pathname: asset.pathname, operations: ['get'] }));
  expect(mocked.requireAdmin).toHaveBeenCalled();
});
it('never signs arbitrary paths or unknown asset IDs', async () => {
  mocked.requireAdmin.mockResolvedValue(undefined);
  for (const id of ['unregistered', 'data/manifest.json', '../private']) {
    expect((await signedUrl(new Request(`https://church.example/api/signed-url?id=${encodeURIComponent(id)}`))).status).toBe(404);
  }
  expect(mocked.issueSignedToken).not.toHaveBeenCalled();
});
it('rejects unauthenticated manifest writes before accessing storage', async () => {
  const response = await PUT(new Request('https://church.example/api/manifest', { method: 'PUT', headers: { origin: 'https://church.example' }, body: JSON.stringify({ manifest: emptyManifest, etag: null }) }));
  expect(response.status).toBe(401); expect(mocked.writeManifest).not.toHaveBeenCalled();
});
it('rejects unauthenticated upload token generation before accessing Blob', async () => {
  const response = await upload(new Request('https://church.example/api/upload', { method: 'POST', headers: { origin: 'https://church.example' }, body: '{}' }));
  expect(response.status).toBe(401); expect(mocked.list).not.toHaveBeenCalled();
});
