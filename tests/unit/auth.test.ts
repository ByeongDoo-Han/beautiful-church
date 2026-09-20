import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { createSession, passwordMatches, sameOrigin, smallJson, verifySession } from '../../src/lib/auth';
afterEach(() => vi.unstubAllEnvs());
describe('admin boundary', () => {
  it('requires an exact matching origin for mutations', () => { expect(() => sameOrigin(new Request('https://church.example/api/login', { headers: { origin: 'https://evil.example' } }))).toThrow(); expect(() => sameOrigin(new Request('https://church.example/api/login', { headers: { origin: 'https://church.example' } }))).not.toThrow(); });
  it('bounds request bodies before JSON parsing', async () => { await expect(smallJson(new Request('https://church.example', { method: 'POST', body: JSON.stringify({ text: 'a'.repeat(1000) }) }), 20)).rejects.toThrow('요청이 너무 큽니다'); });
  it('uses the stored scrypt hash and rejects wrong passwords', async () => { const salt = randomBytes(16).toString('hex'); vi.stubEnv('ADMIN_PASSWORD_HASH', `scrypt$${salt}$${scryptSync('correct-long-password', salt, 64).toString('hex')}`); expect(await passwordMatches('correct-long-password')).toBe(true); expect(await passwordMatches('wrong')).toBe(false); });
  it('verifies signed cookies and rejects tampering or missing secrets', async () => { vi.stubEnv('SESSION_SECRET', 'test-only-secret-that-is-at-least-32-characters'); const token = await createSession(); expect(await verifySession(token)).toBe(true); expect(await verifySession(token.slice(0, -6) + 'forged')).toBe(false); vi.stubEnv('SESSION_SECRET', ''); expect(await verifySession(token)).toBe(false); });
});
