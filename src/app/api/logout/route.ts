import { NextResponse } from 'next/server';
import { apiError, COOKIE, sameOrigin } from '@/lib/auth';
export async function POST(req: Request) {
  try { sameOrigin(req); const r = NextResponse.json({ ok: true }); r.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 }); return r; } catch (e) { return apiError(e); }
}
