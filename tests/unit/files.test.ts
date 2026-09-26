import { beforeEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ requireAdmin: vi.fn(), readManifest: vi.fn(), list: vi.fn() }));
vi.mock('@vercel/blob', () => ({ list: mocked.list }));
vi.mock('../../src/lib/blob-store', () => ({ readManifest: mocked.readManifest }));
vi.mock('../../src/lib/auth', async original => ({ ...await original<object>(), requireAdmin: mocked.requireAdmin }));
import { GET } from '../../src/app/api/files/route';
import { HttpError } from '../../src/lib/auth';
beforeEach(() => vi.resetAllMocks());

it('lists actual uploaded files, including unregistered files, without exposing private URLs', async () => {
  mocked.readManifest.mockResolvedValue({ manifest: { assets: [{ pathname: 'media/a.mp3', name: '주일 찬양.mp3', kind: 'mp3' }, { pathname: 'media/missing.pdf', name: '삭제된 파일.pdf', kind: 'pdf' }] } });
  mocked.list.mockResolvedValue({ blobs: [
    { pathname: 'media/a.mp3', size: 1234, uploadedAt: new Date('2026-09-20T00:00:00Z'), url: 'https://private.example/a', downloadUrl: 'https://private.example/a?download=1' },
    { pathname: 'orphan.pptx', size: 5678, uploadedAt: new Date('2026-09-20T01:00:00Z') },
    { pathname: 'data/manifest.json', size: 100, uploadedAt: new Date('2026-09-20T01:00:00Z') },
  ], hasMore: true, cursor: 'next-page' });
  const response = await GET(new Request('https://church.example/api/files'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ files: [
    { pathname: 'media/a.mp3', name: '주일 찬양.mp3', kind: 'mp3', size: 1234, uploadedAt: '2026-09-20T00:00:00.000Z', registered: true },
    { pathname: 'orphan.pptx', name: 'orphan.pptx', kind: 'pptx', size: 5678, uploadedAt: '2026-09-20T01:00:00.000Z', registered: false },
  ], nextCursor: 'next-page' });
  expect(mocked.list).toHaveBeenCalledWith({ limit: 100, cursor: undefined });
});
it('requires authentication before reading file metadata', async () => {
  mocked.requireAdmin.mockRejectedValue(new HttpError(401, '로그인이 필요합니다.'));
  expect((await GET(new Request('https://church.example/api/files'))).status).toBe(401);
  expect(mocked.list).not.toHaveBeenCalled(); expect(mocked.readManifest).not.toHaveBeenCalled();
});
it('supports an empty final page and validates cursors', async () => {
  mocked.readManifest.mockResolvedValue({ manifest: { assets: [] } });
  mocked.list.mockResolvedValue({ blobs: [], hasMore: false });
  const response = await GET(new Request('https://church.example/api/files?cursor=page-2'));
  expect(await response.json()).toEqual({ files: [], nextCursor: null });
  expect(mocked.list).toHaveBeenCalledWith({ limit: 100, cursor: 'page-2' });
  mocked.list.mockClear();
  expect((await GET(new Request('https://church.example/api/files?cursor='))).status).toBe(400);
  expect(mocked.list).not.toHaveBeenCalled();
});
