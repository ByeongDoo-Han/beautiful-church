import { get, put, head, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import { emptyManifest, manifestSchema, type Manifest, type ManifestEnvelope } from './model';
import { HttpError } from './auth';
const PATH = 'data/manifest.json';
export async function readManifest(): Promise<ManifestEnvelope> {
  try {
    const result = await get(PATH, { access: 'private', useCache: false });
    if (!result) return { manifest: emptyManifest, etag: null };
    if (!result.stream) throw new Error('Missing manifest body');
    return { manifest: manifestSchema.parse(await new Response(result.stream).json()), etag: result.blob.etag };
  } catch (e) {
    if (e instanceof BlobNotFoundError) return { manifest: emptyManifest, etag: null };
    throw e;
  }
}
export async function writeManifest(manifest: Manifest, etag: string | null) {
  for (const asset of manifest.assets) {
    if (!asset.pathname || asset.demoPath) throw new HttpError(400, '서버에 업로드된 자료만 저장할 수 있습니다.');
  }
  // Check only newly referenced objects, rather than issuing HEAD for the entire library on every edit.
  const current = await readManifest();
  if (current.etag !== etag) throw new HttpError(409, '다른 운영자가 수정했습니다. 서버 자료를 다시 불러온 뒤 저장해 주세요.');
  const known = new Map(current.manifest.assets.map(a => [a.id, a]));
  await Promise.all(manifest.assets.map(async a => {
    const prior = known.get(a.id);
    if (prior && prior.pathname === a.pathname && prior.size === a.size && prior.kind === a.kind) return;
    const info = await head(a.pathname!);
    if (info.size !== a.size || info.pathname !== a.pathname) throw new HttpError(400, '업로드 파일 정보가 일치하지 않습니다.');
  }));
  try {
    const result = await put(PATH, JSON.stringify(manifest), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false,
      cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
    });
    return { manifest, etag: result.etag };
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || (e instanceof Error && /already exists/i.test(e.message))) throw new HttpError(409, '저장 충돌입니다. 서버 자료를 다시 불러와 주세요.');
    throw e;
  }
}
