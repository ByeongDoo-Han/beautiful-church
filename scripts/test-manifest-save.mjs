import { operatorPassword } from './operator-credentials.mjs';
// Live no-op save: require byte-for-byte equality with the current stored object before writing.
// Run explicitly: node --env-file=.env.local scripts/test-manifest-save.mjs
// The version condition prevents overwriting concurrent edits; existing slide text is never changed.
import assert from 'node:assert/strict';
import { get } from '@vercel/blob';
import { request } from '@playwright/test';

const base = process.env.SAVE_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const context = await request.newContext();
try {
  const login = await context.post(`${base}/api/login`, { headers: { origin: base }, data: { username: 'admin', password: operatorPassword() } });
  assert.equal(login.status(), 200, 'Authentication failed');
  const response = await context.get(`${base}/api/manifest`);
  assert.equal(response.status(), 200);
  const baseline = await response.json();
  assert.ok(baseline.etag && !baseline.etag.startsWith('W/'), 'API must return a strong revision');
  const raw = await get('data/manifest.json', { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
  assert.ok(raw?.stream);
  assert.equal(raw.blob.etag, baseline.etag, 'Revision changed; refusing to write');
  const originalBytes = await new Response(raw.stream).text();
  assert.equal(JSON.stringify(baseline.manifest), originalBytes, 'Serialization would change stored bytes; refusing to write');

  // Simulate the weak revision held by an existing tab or a recovered failed-save draft.
  const save = await context.put(`${base}/api/manifest`, {
    headers: { origin: base }, data: { manifest: baseline.manifest, etag: `W/${baseline.etag}` },
  });
  assert.equal(save.status(), 200, `No-op save failed (${save.status()})`);
  assert.deepEqual(await save.json(), baseline, 'Same bytes must preserve the revision for existing drafts');
  const reloaded = await context.get(`${base}/api/manifest`);
  assert.equal(reloaded.status(), 200);
  assert.deepEqual(await reloaded.json(), baseline);
  console.log('PASS: real authenticated save accepted an existing weak revision; reload preserved all manifest content and the original ETag.');
} finally {
  await context.dispose();
}
