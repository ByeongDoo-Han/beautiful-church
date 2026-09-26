import { startLocalAdminDraft } from './smoke-draft.mjs';
// Production section and native drag smoke check. Fresh authenticated browser;
// imports stay local and the server library is never modified.
import { chromium, expect } from '@playwright/test';
const base = process.env.SLIDE_HOLD_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
async function dragCard(page, source, target) {
  await source.scrollIntoViewIfNeeded(); const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 6 });
  await expect(source).toHaveClass(/dragging/);
  await target.scrollIntoViewIfNeeded(); const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2); await page.mouse.up();
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } }); context.setDefaultTimeout(30000);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await startLocalAdminDraft(page, base);
  await page.goto(`${base}/admin`);
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles('public/demo/welcome.pptx');
  await expect(page.getByRole('status')).toContainText('1개 파일');
  await page.getByLabel('항목 1 제목', { exact: true }).fill('예배로의 초대');
  for (const [index, title] of ['기도', '성경 봉독'].entries()) {
    await page.getByRole('button', { name: '빈 순서 추가', exact: true }).click();
    await page.getByLabel(`항목 ${index + 2} 제목`, { exact: true }).fill(title);
  }
  await page.getByLabel('예배 파일 불러오기').setInputFiles('public/demo/welcome.pdf');
  await expect(page.getByLabel('항목 4 제목', { exact: true })).toBeVisible();
  await page.getByLabel('항목 4 제목', { exact: true }).fill('설교');
  await page.getByRole('button', { name: '편집 완료', exact: true }).click();
  const source = page.locator('.ppt-section').first(); const target = page.locator('.ppt-section').last();
  const card = source.locator('[data-card-id]').nth(1); const id = await card.getAttribute('data-card-id');
  const moving = page.locator(`[data-card-id="${id}"]`);
  await expect(source.locator('header')).toContainText('welcome.pptx'); await expect(source).toContainText('3개 예배 순서');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' }); await expect(current).toContainText('우리 함께 예배합니다');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click(); const output = await popup;
  const live = output.getByRole('img', { name: '출력 슬라이드' }); await expect(live).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await page.getByRole('button', { name: /기도/ }).click();
  await expect(live).toContainText('찬양으로 마음을 모읍니다');
  await dragCard(page, moving, target.locator('.section-drop-end'));
  await expect(target.locator(`[data-card-id="${id}"]`)).toBeVisible();
  await expect(page.locator('.current-preview canvas')).toBeVisible(); await expect(output.locator('canvas')).toHaveCount(1);
  await dragCard(page, moving, source.locator('[data-card-id]').first());
  await expect(source.locator('[data-card-id]').first()).toHaveAttribute('data-card-id', id);
  await expect(current).toContainText('우리 함께 예배합니다'); await expect(live).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: '미저장 편집본 복구', exact: true }).click(); await expect(source.locator('[data-card-id]').first()).toHaveAttribute('data-card-id', id);
  await expect(current).toContainText('우리 함께 예배합니다');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/ppt-sections-production.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log('PASS: production PPT sections, native drag across sections/reorder, source switch and screen 2 sync, reload persistence; server library unchanged');
} finally { await browser.close(); }
