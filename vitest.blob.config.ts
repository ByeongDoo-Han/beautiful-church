import { defineConfig } from 'vitest/config';

// Explicit opt-in: this suite creates and removes one isolated object in real Blob storage.
export default defineConfig({ test: { include: ['tests/integration/blob-storage.test.ts'], environment: 'node', testTimeout: 60000 } });
