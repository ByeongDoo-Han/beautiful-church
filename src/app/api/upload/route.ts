import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { list } from '@vercel/blob';
import { apiError, HttpError, requireAdmin, sameOrigin, smallJson } from '@/lib/auth';
import { LIMITS, MIME, mediaPath } from '@/lib/model';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const body = await smallJson(req, 16 * 1024) as HandleUploadBody;
    const result = await handleUpload({ body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        sameOrigin(req); await requireAdmin();
        if (!mediaPath.safeParse(pathname).success) throw new HttpError(400, '허용되지 않은 경로입니다.');
        const kind = pathname.split('.').pop() as keyof typeof LIMITS;
        let cursor: string | undefined; let size = 0;
        do { const page = await list({ cursor, limit: 1000 }); size += page.blobs.reduce((n, b) => n + b.size, 0); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
        if (size + LIMITS[kind] > 800 * 1024 ** 2) throw new HttpError(413, '저장공간 800MB 보호 한도입니다. 오래된 자료를 정리해 주세요.');
        return { allowedContentTypes: [MIME[kind]], maximumSizeInBytes: LIMITS[kind], addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60 * 1000 };
      },
      // SDK verifies the callback signature. Never require browser cookies on this webhook.
      // Manifest commit is explicit in the operator UI, so delayed callbacks cannot overwrite it.
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (e) { return apiError(e); }
}
