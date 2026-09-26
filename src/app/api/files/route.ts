import { list } from '@vercel/blob';
import { z } from 'zod';
import { apiError, HttpError, requireAdmin } from '@/lib/auth';
import { readManifest } from '@/lib/blob-store';
import type { ServerFilePage } from '@/lib/server-files';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const parsed = z.string().min(1).max(2000).nullable().safeParse(new URL(req.url).searchParams.get('cursor'));
    if (!parsed.success) throw new HttpError(400, '파일 목록 요청이 올바르지 않습니다.');
    const [page, { manifest }] = await Promise.all([
      list({ limit: 100, cursor: parsed.data ?? undefined }),
      readManifest(),
    ]);
    const registered = new Map(manifest.assets.filter(asset => asset.pathname).map(asset => [asset.pathname, asset]));
    const result: ServerFilePage = {
      files: page.blobs.filter(blob => blob.pathname !== 'data/manifest.json').map(blob => {
        const asset = registered.get(blob.pathname);
        const filename = blob.pathname.split('/').pop() || blob.pathname;
        return {
          pathname: blob.pathname, name: asset?.name ?? filename,
          kind: asset?.kind ?? (filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'file'),
          size: blob.size, uploadedAt: blob.uploadedAt.toISOString(), registered: Boolean(asset),
        };
      }),
      nextCursor: page.hasMore ? page.cursor ?? null : null,
    };
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
