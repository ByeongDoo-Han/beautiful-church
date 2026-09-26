import { operatorPassword } from './operator-credentials.mjs';
// Real browser uploads and downloads against an EMPTY connected Blob library.
// npm run build && node --env-file=.env.local scripts/test-blob.mjs
// BLOB_TEST_BASE_URL can point at a deployed instance of the same project/store.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { BlobNotFoundError, del, get, head, put } from '@vercel/blob';

assert(process.env.BLOB_READ_WRITE_TOKEN, 'BLOB_READ_WRITE_TOKEN is required');
const baseURL = process.env.BLOB_TEST_BASE_URL || 'http://127.0.0.1:3101';
const manifestPath = 'data/manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function optionalHead(pathname) {
  try { return await head(pathname); } catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
}
const original = await optionalHead(manifestPath);
let originalBody;
if (original) {
  const result = await get(manifestPath, { access: 'private', useCache: false });
  originalBody = await new Response(result.stream).text();
  const manifest = JSON.parse(originalBody);
  assert(manifest.assets.length === 0 && manifest.items.length === 0, 'Live smoke test requires an empty library; existing worship data will not be changed.');
}
const fixtures = [];
for (const name of ['welcome.pptx', 'tone.mp3']) {
  const bytes = await readFile(`public/demo/${name}`);
  const id = hash(bytes); const kind = name.split('.').at(-1);
  const pathname = `media/${id}.${kind}`;
  assert.equal(await optionalHead(pathname), null, `Test fixture already exists: ${name}; refusing to overwrite it.`);
  fixtures.push({ name, id, kind, pathname, size: bytes.length });
}
let server; let browser; let uploaded = false; let committedEtag;
try {
  if (!process.env.BLOB_TEST_BASE_URL) {
    server = spawn('npm', ['start', '--', '--port', '3101'], { env: process.env, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  }
  let available = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`${baseURL}/api/config`); const config = await response.json(); if (response.ok) { assert(config.cloud, 'Cloud configuration missing'); available = true; break; } } catch { /* wait for startup */ }
    await delay(500);
  }
  assert(available, 'Cloud server did not become ready');
  const precacheResponse = await fetch(`${baseURL}/precache.json`, { cache: 'no-store' });
  assert(precacheResponse.ok, 'Offline precache index is missing');
  const precachePaths = await precacheResponse.json();
  for (let offset = 0; offset < precachePaths.length; offset += 8) {
    await Promise.all(precachePaths.slice(offset, offset + 8).map(async pathname => {
      const response = await fetch(`${baseURL}${pathname}`, { method: 'HEAD' });
      assert(response.ok, `Offline asset missing (${response.status}): ${pathname}`);
    }));
  }
  console.log(`PASS: all ${precachePaths.length} offline app assets are available`);
  browser = await chromium.launch({ channel: 'chrome' });
  const login = async page => {
    await page.goto(`${baseURL}/login`);
    await page.getByLabel('관리자 아이디').fill('admin');
    await page.getByLabel('관리자 비밀번호').fill(operatorPassword());
    const response = page.waitForResponse(r => r.url().endsWith('/api/login'));
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    assert.equal((await response).status(), 200, 'Browser login failed');
    await page.waitForURL('**/admin');
    await page.getByRole('button', { name: '서버 저장', exact: true }).waitFor();
  };
  const uploader = await browser.newContext(); const page = await uploader.newPage();
  assert.equal((await page.request.get(`${baseURL}/api/manifest`)).status(), 200);
  assert.equal((await page.request.get(`${baseURL}/api/files`)).status(), 401);
  await login(page);
  console.log('PASS: operator account login, public manifest read and anonymous file-list rejection');
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles(fixtures.map(f => `public/demo/${f.name}`));
  await page.getByRole('status').filter({ hasText: '2개 파일' }).waitFor();
  await page.getByRole('button', { name: '편집 완료', exact: true }).click();
  const saveResponse = page.waitForResponse(r => r.url().endsWith('/api/manifest') && r.request().method() === 'PUT', { timeout: 90000 });
  uploaded = true;
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  const saved = await saveResponse;
  assert.equal(saved.status(), 200, `Manifest save failed: ${await saved.text()}`);
  const envelope = await saved.json(); committedEtag = envelope.etag;
  assert.equal(envelope.manifest.assets.length, 2);
  for (const fixture of fixtures) {
    const metadata = await head(fixture.pathname);
    assert.equal(metadata.size, fixture.size);
    fixture.etag = metadata.etag;
    const unsigned = await fetch(metadata.url);
    assert([401, 403, 404].includes(unsigned.status), 'Private file was publicly readable');
    console.log(`PASS: ${fixture.name} browser-to-Blob upload, ${metadata.size} bytes; public access denied`);
  }
  const listing = await page.request.get(`${baseURL}/api/files`);
  assert.equal(listing.status(), 200);
  const listed = await listing.json();
  for (const fixture of fixtures) {
    const file = listed.files.find(file => file.pathname === fixture.pathname);
    assert.equal(file?.name, fixture.name); assert.equal(file?.size, fixture.size); assert.equal(file?.registered, true);
  }
  await page.getByRole('button', { name: '서버 파일 목록', exact: true }).click();
  const library = page.getByRole('dialog', { name: '서버 파일 목록', exact: true });
  for (const fixture of fixtures) await library.getByText(fixture.name, { exact: true }).waitFor();
  await library.screenshot({ path: 'artifacts/server-files.png' });
  await library.getByRole('button', { name: '닫기', exact: true }).click();
  console.log('PASS: authenticated server file API and browser list show original names and actual sizes');
  // A new context has no cookies, IndexedDB, or previously imported files.
  const downloader = await browser.newContext(); const downloadPage = await downloader.newPage();
  downloadPage.on('response', response => {
    if (response.status() >= 400) console.error('Download HTTP failure:', response.status(), new URL(response.url()).pathname);
  });
  await login(downloadPage);
  await downloadPage.getByRole('button', { name: '예배 자료 다운로드', exact: true }).click();
  try { await downloadPage.getByRole('status').filter({ hasText: '준비 완료' }).waitFor({ timeout: 120000 }); }
  catch (error) {
    console.error('Download state:', await downloadPage.locator('.header-actions').innerText(), await downloadPage.getByRole('status').allTextContents());
    throw error;
  }
  for (const fixture of fixtures) {
    const cached = await downloadPage.evaluate(async id => {
      const db = await new Promise((resolve, reject) => { const req = indexedDB.open('beautiful-church-v1'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const file = await new Promise((resolve, reject) => { const req = db.transaction('files').objectStore('files').get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      db.close(); if (!file) return null;
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return { size: file.size, hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
    }, fixture.id);
    assert.deepEqual(cached, { size: fixture.size, hash: fixture.id });
    console.log(`PASS: ${fixture.name} downloaded in clean browser; byte size and SHA-256 match original`);
  }
  await downloader.setOffline(true); await downloadPage.reload();
  await downloadPage.getByRole('img', { name: '현재 슬라이드 미리보기' }).filter({ hasText: '우리 함께 예배합니다' }).waitFor();
  await downloadPage.getByRole('button', { name: /02 tone/ }).click();
  await downloadPage.getByRole('button', { name: '찬양 재생', exact: true }).click();
  await downloadPage.getByRole('button', { name: '찬양 일시정지', exact: true }).waitFor();
  console.log('PASS: downloaded PPTX renders and MP3 plays after offline reload');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ } }
  // Conditional cleanup refuses to overwrite any concurrent edits.
  if (uploaded) {
    const current = await optionalHead(manifestPath);
    if (committedEtag) {
      assert.equal(current?.etag, committedEtag, 'Concurrent manifest edit detected; test data retained for manual review.');
      if (original) await put(manifestPath, originalBody, { access: 'private', contentType: 'application/json', addRandomSuffix: false, ifMatch: committedEtag });
      else await del(manifestPath, { ifMatch: committedEtag });
    } else assert.equal(current?.etag ?? null, original?.etag ?? null, 'Manifest changed during failed test; test data retained.');
    for (const fixture of fixtures) {
      const metadata = await optionalHead(fixture.pathname);
      if (metadata) await del(fixture.pathname, { ifMatch: fixture.etag ?? metadata.etag });
      assert.equal(await optionalHead(fixture.pathname), null);
    }
    console.log('PASS: test files removed; previous library restored');
  }
}
