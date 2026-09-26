import { operatorPassword } from './operator-credentials.mjs';
// Production permission smoke: local draft edits only; never writes server data.
import { chromium, expect } from '@playwright/test';
const base = process.env.READONLY_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  context.setDefaultTimeout(30000);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const publishedResponse = await context.request.get(`${base}/api/manifest`);
  expect(publishedResponse.status()).toBe(200);
  const published = await publishedResponse.json();
  expect((await context.request.put(`${base}/api/manifest`, { headers: { origin: base }, data: {} })).status()).toBe(401);
  expect((await context.request.get(`${base}/api/files`)).status()).toBe(401);
  expect((await context.request.get(`${base}/api/signed-url?id=unregistered`)).status()).toBe(404);
  const file = published.manifest.assets.find(a => a.pathname);
  if (file) {
    const signed = await context.request.get(`${base}/api/signed-url?id=${encodeURIComponent(file.id)}`);
    expect(signed.status()).toBe(200);
    const response = await context.request.get((await signed.json()).url, { headers: { Range: 'bytes=0-15' } });
    expect([200, 206]).toContain(response.status());
  }
  await page.goto(`${base}/admin`);
  await expect(page.locator('.readonly-notice')).toBeVisible();
  await expect(page.locator('.service-summary h2')).toHaveText(published.manifest.title);
  await expect(page.locator('[data-card-id]')).toHaveCount(published.manifest.items.length);
  await expect(page.getByRole('button', { name: '슬라이드 편집', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/readonly-production.png', fullPage: true });
  await page.getByRole('link', { name: '관리자 로그인' }).click();
  await page.getByLabel('관리자 아이디').fill('admin'); await page.getByLabel('관리자 비밀번호').fill(operatorPassword());
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL('**/admin');
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toBeVisible({ timeout: 30000 });
  // Guard against accidentally modifying any existing production data.
  await page.route('**/api/manifest', r => r.request().method() === 'PUT' ? r.abort() : r.continue());
  await page.route('**/api/upload', r => r.abort());
  const sectionCount = await page.locator('.ppt-section').count();
  await page.getByRole('button', { name: 'PPT 섹션 추가', exact: true }).click();
  await page.getByRole('button', { name: '섹션 만들기', exact: true }).click();
  const section = page.locator('.ppt-section').last(); const sectionId = await section.getAttribute('data-section-id');
  await section.getByRole('button', { name: `PPT 섹션 ${sectionCount + 1}에 순서 추가`, exact: true }).click();
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/queue-delete-production.png', fullPage: true });
  page.once('dialog', d => d.accept());
  await section.getByRole('button', { name: '새 예배 순서 카드 삭제', exact: true }).click();
  await expect(section).toContainText('0개 예배 순서');
  page.once('dialog', d => d.accept());
  await section.getByRole('button', { name: `PPT 섹션 ${sectionCount + 1} 삭제`, exact: true }).click();
  await expect(page.locator(`[data-section-id="${sectionId}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.locator('.readonly-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toHaveCount(0);
  const after = await context.request.get(`${base}/api/manifest`);
  expect(await after.json()).toEqual(published);
  expect(errors).toEqual([]);
  console.log('PASS: production guest reads/downloads, rejected unauthenticated writes, real admin login, card/empty-section deletion, logout read-only; published manifest unchanged');
} finally { await browser.close(); }
