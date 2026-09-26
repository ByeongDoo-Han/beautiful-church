import { TEST_PASSWORD, TEST_PASSWORD_HASH } from '../helpers/credentials';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authConfigured, cloudConfigured, createSession, passwordMatches, sameOrigin, smallJson, verifySession } from '../../src/lib/auth';
afterEach(() => vi.unstubAllEnvs());
describe('admin boundary', () => {
  it('requires an exact matching origin for mutations', () => { expect(() => sameOrigin(new Request('https://church.example/api/login', { headers: { origin: 'https://evil.example' } }))).toThrow(); expect(() => sameOrigin(new Request('https://church.example/api/login', { headers: { origin: 'https://church.example' } }))).not.toThrow(); });
  it('compares the browser origin against the incoming host instead of Next internal hostname', () => {
    expect(() => sameOrigin(new Request('http://localhost:3101/api/login', { headers: { host: '127.0.0.1:3101', origin: 'http://127.0.0.1:3101' } }))).not.toThrow();
    expect(() => sameOrigin(new Request('http://localhost:3101/api/login', { headers: { host: '127.0.0.1:3101', origin: 'https://attacker.example' } }))).toThrow();
  });
  it('bounds request bodies before JSON parsing', async () => { await expect(smallJson(new Request('https://church.example', { method: 'POST', body: JSON.stringify({ text: 'a'.repeat(1000) }) }), 20)).rejects.toThrow('요청이 너무 큽니다'); });
  it('accepts only the configured operator password', async () => { expect(await passwordMatches(TEST_PASSWORD)).toBe(true); expect(await passwordMatches('wrong')).toBe(false); expect(await passwordMatches('')).toBe(false); });
  it('also accepts existing dollar-separated private verifiers', async () => { vi.stubEnv('ADMIN_PASSWORD_HASH', TEST_PASSWORD_HASH.replace(/:/g, '$')); expect(await passwordMatches(TEST_PASSWORD)).toBe(true); });
  it.each(['', 'malformed'])('fails closed when the private password verifier is invalid: %s', async verifier => { vi.stubEnv('SESSION_SECRET', 'test-only-secret-that-is-at-least-32-characters'); vi.stubEnv('ADMIN_PASSWORD_HASH', verifier); expect(authConfigured()).toBe(false); expect(await passwordMatches(TEST_PASSWORD)).toBe(false); });
  it('keeps session configuration required and separates login from Blob availability', () => { vi.stubEnv('SESSION_SECRET', 'test-only-secret-that-is-at-least-32-characters'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', ''); expect(authConfigured()).toBe(true); expect(cloudConfigured()).toBe(false); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-blob-token'); expect(cloudConfigured()).toBe(true); vi.stubEnv('SESSION_SECRET', ''); expect(authConfigured()).toBe(false); expect(cloudConfigured()).toBe(false); });
  it('verifies signed cookies and rejects tampering or missing secrets', async () => { vi.stubEnv('SESSION_SECRET', 'test-only-secret-that-is-at-least-32-characters'); const token = await createSession(); expect(await verifySession(token)).toBe(true); expect(await verifySession(token.slice(0, -6) + 'forged')).toBe(false); vi.stubEnv('SESSION_SECRET', ''); expect(await verifySession(token)).toBe(false); });
});
