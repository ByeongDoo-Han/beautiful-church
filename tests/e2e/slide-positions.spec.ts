import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { manifestSchema, type Manifest } from '../../src/lib/model';
import { signIn } from '../helpers/admin';

test('each card remembers its page across navigation, output controls, save, reload and a fresh device', async ({ page, browser, baseURL }) => {
  const bytes = await readFile('public/demo/welcome.pptx');
  const id = createHash('sha256').update(bytes).digest('hex');
  let saved: Manifest = {
    version: 1, title: '순서별 슬라이드',
    assets: [{ id, name: 'welcome.pptx', kind: 'pptx', size: bytes.length, pathname: `media/${id}.pptx` }],
    // Identical titles must still select independent pages by card ID.
    items: ['first', 'second', 'third'].map(id => ({ id, title: '예배 순서' })),
    sections: [{ id: 'shared', presentationId: id, itemIds: ['first', 'second', 'third'] }],
  };
  let puts = 0;
  const connect = async (target: Page) => {
    await signIn(target.request);
    await target.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
    await target.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pptx` } }));
    await target.route('**/api/upload', r => r.abort());
    await target.route('**/api/manifest', r => {
      if (r.request().method() === 'PUT') { saved = manifestSchema.parse(r.request().postDataJSON().manifest); puts++; }
      return r.fulfill({ json: { manifest: saved, etag: `v${puts}` } });
    });
  };
  const select = (target: Page, item: string) => target.locator(`[data-card-id="${item}"] .queue-item`).click();
  await connect(page); await page.goto('/admin');
  const counter = page.locator('.slide-counter');
  await expect(counter).toHaveText('01/ 03');
  await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(counter).toHaveText('02/ 03');
  await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeEnabled();
  await select(page, 'second'); await expect(counter).toHaveText('01/ 03');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup;
  const live = output.getByRole('img', { name: '출력 슬라이드' });
  await expect(live).toContainText('우리 함께 예배합니다');
  await output.keyboard.press('ArrowRight'); await expect(counter).toHaveText('02/ 03');
  await output.keyboard.press('ArrowRight'); await expect(counter).toHaveText('03/ 03');
  await expect(live).toContainText('함께 기도합니다');
  await select(page, 'first'); await expect(counter).toHaveText('02/ 03');
  await expect(live).toContainText('찬양으로 마음을 모읍니다');
  await select(page, 'third'); await expect(counter).toHaveText('01/ 03');
  await select(page, 'second'); await expect(counter).toHaveText('03/ 03');
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장완료', exact: true })).toBeDisabled();
  expect(saved.items.map(i => i.slidePositions?.[id] ?? 0)).toEqual([1, 2, 0]);
  expect(puts).toBe(1);
  await page.reload(); await expect(counter).toHaveText('03/ 03');
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage(); await connect(fresh); await fresh.goto(`${baseURL}/admin`);
    await expect(fresh.locator('.slide-counter')).toHaveText('02/ 03');
    await select(fresh, 'second'); await expect(fresh.locator('.slide-counter')).toHaveText('03/ 03');
    await select(fresh, 'third'); await expect(fresh.locator('.slide-counter')).toHaveText('01/ 03');
    await expect(fresh.getByRole('button', { name: '서버 저장', exact: true })).toBeDisabled();
  } finally { await freshContext.close(); }
  await page.getByRole('button', { name: '이전 슬라이드', exact: true }).click();
  await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeEnabled();
  // A published position beyond a shortened deck clamps after async loading.
  saved.items[1].slidePositions = { [id]: 999 };
  await page.reload(); await expect(counter).toHaveText('03/ 03');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('함께 기도합니다');
});
