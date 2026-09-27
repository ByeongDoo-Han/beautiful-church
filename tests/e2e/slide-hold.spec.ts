import { signIn } from '../helpers/admin';
import { test, expect, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await signIn(page.request); });

// Start the native gesture before scrolling its destination into view. Chromium
// cancels a pending (not yet started) drag if a programmatic scroll comes first.
async function dragCard(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 6 });
  await expect(source).toHaveClass(/dragging/);
  await target.scrollIntoViewIfNeeded();
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  await page.mouse.up();
}


test('service date uses Korea time without hydration errors in another browser time zone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: 'Pacific/Honolulu' });
  try {
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await signIn(page.request);
    await page.goto(`${baseURL}/admin`);
    const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
    await expect(page.locator('.service-summary p')).toHaveText(koreanDate);
    await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('drag cards between PPT sections and reorder them while preserving page and audio', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/admin');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('우리 함께 예배합니다');
  const source = page.locator('[data-section-id="welcome"]');
  await expect(source.locator('header')).toContainText('예배 안내.pptx');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click(); const output = await popup;
  const live = output.getByRole('img', { name: '출력 슬라이드' }); await expect(live).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await dragCard(page, page.locator('[data-card-id="prayer"]'), source.locator('.section-drop-end'));
  await dragCard(page, page.locator('[data-card-id="praise"]'), source.locator('.section-drop-end'));
  await expect(source.locator('[data-card-id]')).toHaveCount(3);
  await expect(source.locator('header')).toContainText('3개 예배 순서');
  await page.getByRole('button', { name: /함께 드리는 기도/ }).click();
  await expect(current).toContainText('찬양으로 마음을 모읍니다'); await expect(live).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await page.getByRole('button', { name: '찬양 재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '찬양 일시정지', exact: true })).toBeVisible();
  await dragCard(page, page.locator('[data-card-id="praise"]'), page.locator('[data-card-id="welcome"]'));
  await expect(source.locator('[data-card-id]').first()).toHaveAttribute('data-card-id', 'praise');
  await expect(current).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: '찬양 일시정지', exact: true }).click();
  await page.reload(); await expect(source.locator('[data-card-id]').first()).toHaveAttribute('data-card-id', 'praise');
  await expect(current).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: 'PDF로 전환', exact: true }).click();
  await expect(page.locator('.current-preview canvas')).toBeVisible();
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await page.getByRole('button', { name: /함께 드리는 기도/ }).click();
  await expect(page.locator('.slide-counter')).toHaveText('02/ 03');
  await page.reload(); await expect(page.locator('.current-preview canvas')).toBeVisible();
  await expect(page.locator('.slide-counter')).toHaveText('02/ 03');
  // Moving the active card to an empty section changes only its presentation.
  await dragCard(page, page.locator('[data-card-id="prayer"]'), page.locator('[data-section-id="prayer"] .section-drop-end'));
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
  await expect(page.locator('.current-preview canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('section edits survive moving the original first card; empty sections accept drops and keyboard moves', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await dragCard(page, page.locator('[data-card-id="praise"]'), page.locator('[data-section-id="welcome"] .section-drop-end'));
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  await expect(dialog).toContainText('2개 순서에 적용');
  await dialog.locator('textarea').filter({ hasText: '우리 함께 예배합니다' }).fill('PPT 섹션에 보존한 문구');
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await dragCard(page, page.locator('[data-card-id="welcome"]'), page.locator('[data-section-id="prayer"] .section-drop-end'));
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('PPT 섹션에 보존한 문구');
  await page.getByRole('button', { name: 'PPT 섹션 추가', exact: true }).click();
  const empty = page.locator('.ppt-section').last(); await expect(empty).toContainText('0개 예배 순서');
  await dragCard(page, page.locator('[data-card-id="prayer"]'), empty.locator('.section-drop-end'));
  await expect(empty.locator('[data-card-id="prayer"]')).toBeVisible();
  await page.locator('[data-card-id="welcome"] .card-grip').click();
  await page.getByRole('group', { name: '예배로의 초대 이동할 PPT 섹션', exact: true }).getByRole('button', { name: /^1\./ }).click();
  await expect(page.locator('[data-section-id="welcome"] [data-card-id="welcome"]')).toBeVisible();
  await page.getByRole('button', { name: /예배로의 초대/ }).click();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('PPT 섹션에 보존한 문구');
  await page.screenshot({ path: 'artifacts/ppt-sections.png', fullPage: true });
});

test('legacy hold ranges migrate to sections and can be saved without losing card or file settings', async ({ page }) => {
  const { demoManifest } = await import('../../src/lib/model');
  const legacy = { ...demoManifest, items: demoManifest.items.map((i, n) => n === 0 ? { ...i, slideHoldCount: 3 } : i) };
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/manifest', r => r.fulfill({ json: { manifest: legacy, etag: 'v1' } }));
  await page.goto('/admin');
  await expect(page.locator('.ppt-section')).toHaveCount(1);
  await expect(page.locator('.ppt-section [data-card-id]')).toHaveCount(3);
  await page.getByRole('button', { name: /함께 드리는 기도/ }).click();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await expect(page.getByRole('group', { name: 'PPT 섹션 1 파일', exact: true }).getByRole('button', { name: '예배 안내.pptx', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'PPT 섹션 1 대체 PDF', exact: true }).getByRole('button', { name: '예배 안내.pdf', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '찬양 · 음향 리허설 찬양 MP3', exact: true }).getByRole('button', { name: '재생 테스트 음원.mp3', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
