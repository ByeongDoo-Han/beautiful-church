import { NextResponse } from 'next/server';
import { apiError, authConfigured, COOKIE, createSession, HttpError, passwordMatches, sameOrigin, smallJson } from '@/lib/auth';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (!authConfigured()) throw new HttpError(503, '서버 인증 설정이 필요합니다.');
    const parsed = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) }).safeParse(await smallJson(req, 2048));
    if (!parsed.success) throw new HttpError(400, '아이디와 비밀번호를 확인해 주세요.');
    const validPassword = await passwordMatches(parsed.data.password);
    if (parsed.data.username !== 'admin' || !validPassword) throw new HttpError(401, '아이디 또는 비밀번호가 일치하지 않습니다.');
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE, await createSession(), { httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 43200 });
    return response;
  } catch (e) { return apiError(e); }
}
