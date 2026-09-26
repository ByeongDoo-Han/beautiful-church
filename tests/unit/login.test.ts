import { TEST_PASSWORD } from '../helpers/credentials';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/login/route';
import { COOKIE, verifySession } from '../../src/lib/auth';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-only-secret-that-is-at-least-32-characters');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
});
afterEach(() => vi.unstubAllEnvs());
const login = (body: object, origin = 'https://church.example') => POST(new Request('https://church.example/api/login', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

describe('fixed operator login', () => {
  it('accepts the configured operator account and issues a valid protected session without Blob configured', async () => {
    const response = await login({ username: 'admin', password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=strict');
    const token = cookie.split(';')[0].slice(`${COOKIE}=`.length);
    expect(await verifySession(token)).toBe(true);
  });
  it.each([
    { username: 'other', password: TEST_PASSWORD },
    { username: 'admin', password: 'wrong' },
  ])('rejects incorrect credentials without a session: $username', async body => {
    const response = await login(body); expect(response.status).toBe(401); expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('requires a username and refuses foreign origins', async () => {
    expect((await login({ password: TEST_PASSWORD })).status).toBe(400);
    expect((await login({ username: 'admin', password: TEST_PASSWORD }, 'https://attacker.example')).status).toBe(403);
  });
  it('refuses login when the session signing secret is missing', async () => {
    vi.stubEnv('SESSION_SECRET', ''); expect((await login({ username: 'admin', password: TEST_PASSWORD })).status).toBe(503);
  });
});
