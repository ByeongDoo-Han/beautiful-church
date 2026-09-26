import { scryptSync } from 'node:crypto';

// Public, local-test-only credentials. Production reads its separate verifier from Vercel.
export const TEST_PASSWORD = 'local-test-password-not-production';
const salt = '0123456789abcdef0123456789abcdef';
export const TEST_PASSWORD_HASH = `scrypt:${salt}:${scryptSync(TEST_PASSWORD, salt, 64).toString('hex')}`;
