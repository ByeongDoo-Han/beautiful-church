import { operatorPassword } from './operator-credentials.mjs';
// Uses isolated browser storage and read-only server requests. Only a synthetic
// PC draft is created; the published manifest is compared before and after.
import { chromium, expect } from '@playwright/test';
const base = process.env.SERVER_SOURCE_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  context.setDefaultTimeout(30000);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.request.get(`${base}/api/manifest`);
  expect(response.status()).toBe(200); const baseline = await response.json();
  await page.goto(`${base}/admin`);
  await expect(page.locator('.readonly-notice')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.service-summary h2')).toHaveText(baseline.manifest.title);
  await page.getByRole('link', { name: '관리자 로그인', exact: true }).click();
  await page.getByLabel('관리자 아이디').fill('admin'); await page.getByLabel('관리자 비밀번호').fill(operatorPassword());
  const login = page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  expect((await login).status()).toBe(200); await page.waitForURL('**/admin');
  await expect(page.locator('.library-source')).toContainText('서버 저장본', { timeout: 30000 });
  await page.route('**/api/manifest', r => r.request().method() === 'PUT' ? r.abort() : r.continue());
  await page.route('**/api/upload', r => r.abort());
  const old = structuredClone(baseline); old.manifest.title = '이전 PC 캐시 검증'; old.etag = 'old-browser-version';
  const owner = old.manifest.sections?.find(s => s.presentationEdit) ?? old.manifest.items.find(i => i.presentationEdit);
  if (owner?.presentationEdit) {
    owner.presentationEdit.version = crypto.randomUUID();
    const key = Object.keys(owner.presentationEdit.slides[0].texts)[0];
    if (key) owner.presentationEdit.slides[0].texts[key] = '서버와 다른 이전 PC 메타데이터';
  }
  await page.evaluate(async old => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('beautiful-church-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('metadata', 'readwrite'); tx.objectStore('metadata').put(old, 'cloud'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }, old);
  await page.reload();
  await expect(page.locator('.service-summary h2')).toHaveText(baseline.manifest.title, { timeout: 30000 });
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).not.toContainText('서버와 다른 이전 PC 메타데이터');
  await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '미저장 편집본 복구', exact: true }).click();
  await expect(page.locator('.service-summary h2')).toHaveText('이전 PC 캐시 검증');
  await expect(page.locator('.library-source')).toContainText('미저장 편집 중');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '서버 자료 다시 불러오기', exact: true }).click();
  await expect(page.locator('.service-summary h2')).toHaveText(baseline.manifest.title, { timeout: 30000 });
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/server-source-production.png', fullPage: true });
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '편집본 삭제', exact: true }).click();
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.locator('.library-source')).toContainText('서버 저장본', { timeout: 30000 });
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.locator('.readonly-notice')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.service-summary h2')).toHaveText(baseline.manifest.title);
  expect(await (await page.request.get(`${base}/api/manifest`)).json()).toEqual(baseline);
  expect(errors).toEqual([]);
  console.log('PASS: admin and guest start from the same server library, legacy PC metadata is recovery-only, explicit recovery/discard works; published library unchanged');
} finally { await browser.close(); }
