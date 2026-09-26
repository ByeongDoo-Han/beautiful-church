import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { TEST_PASSWORD_HASH } from './tests/helpers/credentials';
export default defineConfig({ resolve: { alias: { '@': path.resolve(__dirname, 'src') } }, test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', env: { ADMIN_PASSWORD_HASH: TEST_PASSWORD_HASH } } });
