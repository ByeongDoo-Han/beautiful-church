import { operatorPassword } from './operator-credentials.mjs';
// Read-only production smoke: downloads a ZIP in an isolated browser without modifying server data.
import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.DOWNLOAD_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/manifest', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.route('**/api/upload', route => route.abort());
  const login = await page.request.post(`${base}/api/login`, { headers: { origin: base }, data: { username: 'admin', password: operatorPassword() } });
  expect(login.status()).toBe(200);
  const before = await (await page.request.get(`${base}/api/manifest`)).json();
  // Native pickers are tested with a real writable handle in the browser suite.
  // This smoke verifies the deployed ZIP output through the browser download fallback.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.goto(`${base}/admin`);
  const button = page.getByRole('button', { name: '예배 자료 다운로드', exact: true });
  await expect(button).toBeEnabled();
  const downloading = page.waitForEvent('download'); await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/예배자료\.zip$/);
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const info = JSON.parse(await zip.file('예배정보.json').async('string'));
  expect(info.manifest.title).toBe(before.manifest.title);
  expect(info.manifest.items).toEqual(before.manifest.items);
  for (const file of info.files) {
    const bytes = await zip.file(file.path).async('nodebuffer');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.assetId);
  }
  expect(await zip.file('안내.txt').async('string')).toContain('원본 PPTX 파일에는 반영되지 않습니다');
  await expect(page.locator('.notice[role=status]')).toContainText('저장 위치는 브라우저 다운로드 설정을 따릅니다.', { timeout: 60000 });
  await expect(button).toBeEnabled();
  await page.screenshot({ path: 'artifacts/download-location-production.png', fullPage: true });
  expect(await (await page.request.get(`${base}/api/manifest`)).json()).toEqual(before);
  expect(errors).toEqual([]);
  console.log(`PASS: deployed ZIP download contains ${info.files.length} source files with matching SHA-256 hashes, edit metadata and link instructions; server manifest unchanged.`);
} finally { await browser.close(); }
