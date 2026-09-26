import { TEST_PASSWORD } from '../helpers/credentials';
import { expect, test } from '@playwright/test';
import { signIn } from '../helpers/admin';

test('branding appears on login, browser title and installed app manifest', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('아름다운교회 영아부 | 예배 운영');
  await expect(page.getByRole('heading', { name: '아름다운교회 영아부', exact: true })).toBeVisible();
  expect((await (await page.request.get('/manifest.webmanifest')).json()).name).toBe('아름다운교회 영아부');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('logout returns all open operator tabs to login and direct output access is blocked', async ({ page, context }) => {
  await signIn(page.request); await page.goto('/admin');
  const other = await context.newPage(); await other.goto('/worship');
  await expect(other.locator('.brand')).toContainText('아름다운교회 영아부');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); await expect(other).toHaveURL(/\/login$/);
  await page.goto('/output'); await expect(page).toHaveURL(/\/login$/);
  await page.goto('/admin'); await expect(page).toHaveURL(/\/login$/);
});

test('a forged session cannot open console or output pages', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'worship-session', value: 'forged', url: baseURL! }]);
  await page.goto('/admin'); await expect(page).toHaveURL(/\/login$/);
  await page.goto('/output'); await expect(page).toHaveURL(/\/login$/);
});

test('login removes protected HTML left in caches by the old guest version', async ({ page }) => {
  await page.goto('/login'); await expect(page.getByLabel('관리자 아이디')).toBeEnabled();
  await page.evaluate(async () => {
    const cache = await caches.open('worship-shell-legacy');
    for (const url of ['/', '/admin', '/worship', '/output']) await cache.put(url, new Response('old guest shell'));
    await cache.put('/icons/keep.png', new Response('keep static asset'));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('worship-shell-legacy');
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  })).toEqual(['/icons/keep.png']);
});

test('operator logs in with the fixed username and password', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('관리자 아이디').fill('admin');
  await page.getByLabel('관리자 비밀번호').fill('wrong');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.login-card [role="alert"]')).toContainText('아이디 또는 비밀번호가 일치하지 않습니다.');
  expect((await context.cookies()).some(c => c.name === 'worship-session')).toBe(false);
  await page.getByLabel('관리자 비밀번호').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const response = await page.request.get('/api/config');
  expect((await response.json()).authenticated).toBe(true);
  const cookie = (await context.cookies()).find(c => c.name === 'worship-session');
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Strict');
});

test('login waits for hydration before accepting input on a slow first load', async ({ page }) => {
  let release!: () => void;
  const scriptsReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/static/**/*.js', async route => { await scriptsReady; await route.continue(); });
  try {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.getByLabel('관리자 아이디')).toBeDisabled();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeDisabled();
    release();
    await expect(page.getByLabel('관리자 아이디')).toBeEnabled();
    await page.getByLabel('관리자 아이디').fill('admin');
    await page.getByLabel('관리자 비밀번호').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toBeVisible();
  } finally { release(); }
});
