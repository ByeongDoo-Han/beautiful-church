// Read-only production check: validates the currently saved metadata against the
// actual guest previews and screen 2 without changing the published library.
import { chromium, expect } from '@playwright/test';
const base = process.env.METADATA_TEST_BASE_URL || 'https://beautiful-church-tau.vercel.app';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  context.setDefaultTimeout(30000);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.request.get(`${base}/api/manifest`);
  expect(response.status()).toBe(200);
  const published = await response.json();
  const { manifest } = published;
  const owners = manifest.sections
    ? manifest.sections.map(section => ({ card: section.itemIds[0], edit: section.presentationEdit }))
    : manifest.items.map(item => ({ card: item.id, edit: item.presentationEdit }));
  const edited = owners.find(owner => owner.card && owner.edit);
  if (!edited) throw new Error('The published library has no edited slide metadata to verify.');
  await page.goto(`${base}/admin`);
  await expect(page.locator('.readonly-notice')).toBeVisible({ timeout: 30000 });
  await page.locator(`[data-card-id="${edited.card}"] .queue-item`).click();
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  const count = edited.edit.slides.length;
  await expect(page.locator('.slide-counter')).toContainText(`/ ${String(count).padStart(2, '0')}`, { timeout: 30000 });
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup; const live = output.getByRole('img', { name: '출력 슬라이드' });
  for (let index = 0; index < count; index++) {
    for (const text of Object.values(edited.edit.slides[index].texts).filter(Boolean)) {
      await expect(current).toContainText(text, { timeout: 30000 });
      await expect(live).toContainText(text, { timeout: 30000 });
    }
    if (index + 1 < count) await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  }
  await page.bringToFront();
  await page.getByRole('button', { name: '서버 저장정보 동기화', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('편집 내용을 동기화했습니다', { timeout: 30000 });
  await expect(page.locator('.slide-counter')).toHaveText(`${String(count).padStart(2, '0')}/ ${String(count).padStart(2, '0')}`);
  await expect(page.getByRole('button', { name: '슬라이드 편집', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/published-metadata-production.png', fullPage: true });
  const after = await page.request.get(`${base}/api/manifest`);
  expect(await after.json()).toEqual(published); expect(errors).toEqual([]);
  console.log(`PASS: anonymous saved metadata in ${count} slides, both screens, manual refresh preserves current page, no editing permission; server data unchanged`);
} finally { await browser.close(); }
