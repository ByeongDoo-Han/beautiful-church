import { issueSignedToken, presignUrl } from '@vercel/blob';
import { apiError, HttpError, requireAdmin } from '@/lib/auth';
import { readManifest } from '@/lib/blob-store';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const assetId = new URL(req.url).searchParams.get('id');
    const { manifest } = await readManifest();
    const asset = manifest.assets.find(a => a.id === assetId);
    if (!asset?.pathname) throw new HttpError(404, '자료를 찾을 수 없습니다.');
    const validUntil = Date.now() + 5 * 60 * 1000;
    const token = await issueSignedToken({ pathname: asset.pathname, operations: ['get'], validUntil });
    const result = await presignUrl(token, { pathname: asset.pathname, operation: 'get', access: 'private', validUntil });
    return Response.json({ url: result.presignedUrl, expiresAt: validUntil });
  } catch (e) { return apiError(e); }
}
