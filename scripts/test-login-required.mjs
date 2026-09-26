import { operatorPassword } from './operator-credentials.mjs';
// Uses an isolated browser and read-only manifest requests. No worship data is written.
import { chromium, expect } from '@playwright/test';
const base = process.env.LOGIN_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/admin', '/worship', '/output']) {
    await page.goto(`${base}${path}`);
    await expect(page).toHaveURL(`${base}/login`);
    await expect(page.getByRole('heading', { name: '아름다운교회 영아부', exact: true })).toBeVisible();
    await expect(page.locator('.console-main, .output-slide')).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: '로그인 없이 보기' })).toHaveCount(0);
  await expect(page).toHaveTitle('아름다운교회 영아부 | 예배 운영');
  for (const path of ['/api/manifest', '/api/signed-url?id=demo-pptx', '/api/files']) {
    expect((await page.request.get(`${base}${path}`)).status()).toBe(401);
  }
  const app = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
  expect(app.name).toBe('아름다운교회 영아부');
  const precache = await (await page.request.get(`${base}/precache.json`)).json();
  for (const path of ['/admin', '/worship', '/output']) expect(precache).not.toContain(path);
  await page.screenshot({ path: 'artifacts/login-required-production.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/login-required-mobile.png', fullPage: true });
  await page.getByLabel('관리자 아이디').fill('admin');
  await page.getByLabel('관리자 비밀번호').fill(operatorPassword());
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(`${base}/admin`);
  await expect(page.locator('.brand')).toContainText('아름다운교회 영아부');
  await expect(page.getByRole('region', { name: '선택한 예배 순서 음원 편집' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const response = await page.request.get(`${base}/api/manifest`); expect(response.status()).toBe(200);
  const baseline = await response.json();
  await page.setViewportSize({ width: 1512, height: 982 });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup;
  await expect(output.locator('.output-setup')).toContainText('아름다운교회 영아부');
  const other = await context.newPage(); await other.goto(`${base}/worship`);
  await expect(other.locator('.brand')).toContainText('아름다운교회 영아부');
  expect(await (await page.request.get(`${base}/api/manifest`)).json()).toEqual(baseline);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(`${base}/login`); await expect(other).toHaveURL(`${base}/login`);
  await expect.poll(() => output.isClosed()).toBe(true);
  await page.goto(`${base}/admin`); await expect(page).toHaveURL(`${base}/login`);
  expect((await page.request.get(`${base}/api/manifest`)).status()).toBe(401);
  expect(errors).toEqual([]);
  console.log('PASS: production login-first routes, private API authentication, branding, mobile layout, output and cross-tab logout; manifest unchanged.');
} finally { await browser.close(); }
