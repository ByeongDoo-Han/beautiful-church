import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export const COOKIE = 'worship-session';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function cloudConfigured() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.ADMIN_PASSWORD_HASH && (process.env.SESSION_SECRET?.length ?? 0) >= 32); }
function secret() {
  if ((process.env.SESSION_SECRET?.length ?? 0) < 32) throw new HttpError(503, '서버 인증 설정이 필요합니다.');
  return new TextEncoder().encode(process.env.SESSION_SECRET!);
}
export async function verifySession(token?: string) {
  if (!token) return false;
  try { const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'], issuer: 'worship', audience: 'operator' }); return payload.sub === 'admin'; } catch { return false; }
}
export async function requireAdmin() {
  if (!cloudConfigured()) throw new HttpError(503, 'Vercel Blob과 관리자 환경변수를 먼저 설정해 주세요.');
  if (!await verifySession((await cookies()).get(COOKIE)?.value)) throw new HttpError(401, '로그인이 필요합니다.');
}
export function sameOrigin(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
}
export async function passwordMatches(password: string) {
  const [format, salt, hex] = (process.env.ADMIN_PASSWORD_HASH ?? '').split('$');
  if (format !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hex ?? '')) throw new HttpError(503, '관리자 비밀번호 해시를 확인해 주세요.');
  const derived = await promisify(scrypt)(password, salt, 64) as Buffer;
  return timingSafeEqual(derived, Buffer.from(hex, 'hex'));
}
export async function createSession() {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('admin').setIssuer('worship').setAudience('operator').setIssuedAt().setExpirationTime('12h').sign(secret());
}
export function apiError(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error('API failure', e instanceof Error ? e.name : 'UnknownError');
  return Response.json({ error: '요청을 처리하지 못했습니다. 연결과 서버 설정을 확인해 주세요.' }, { status: 500 });
}
export async function smallJson(req: Request, limit = 256 * 1024): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, '요청 본문이 없습니다.');
  let bytes = 0; const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new HttpError(413, '요청이 너무 큽니다.'); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new HttpError(400, '올바른 JSON이 아닙니다.'); }
}
