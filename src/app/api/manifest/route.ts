import { apiError, HttpError, requireAdmin, sameOrigin, smallJson } from '@/lib/auth';
import { readManifest, writeManifest } from '@/lib/blob-store';
import { manifestSchema } from '@/lib/model';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET() {
  try { await requireAdmin(); return Response.json(await readManifest()); } catch (e) { return apiError(e); }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req); await requireAdmin();
    const body = z.object({ manifest: manifestSchema, etag: z.string().max(200).nullable() }).safeParse(await smallJson(req));
    if (!body.success) throw new HttpError(400, '예배 자료 형식이 올바르지 않습니다.');
    return Response.json(await writeManifest(body.data.manifest, body.data.etag));
  } catch (e) { return apiError(e); }
}
