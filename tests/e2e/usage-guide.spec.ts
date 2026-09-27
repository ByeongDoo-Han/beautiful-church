import { test, expect, type Page } from '@playwright/test';
import { demoManifest, emptyManifest, type Manifest } from '../../src/lib/model';
import { signIn } from '../helpers/admin';

async function setup(page: Page, manifest: Manifest = demoManifest) {
  await signIn(page.request);
  let writes = 0;
  await page.route('**/api/config', route => route.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/manifest', route => {
    if (route.request().method() !== 'GET') { writes++; return route.abort(); }
    return route.fulfill({ json: { manifest, etag: 'guide-fixture' } });
  });
  await page.goto('/admin');
  return () => writes;
}

for (const viewport of [{ width: 1512, height: 982 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`spotlight guide fits every step, preserves worship state and can be replayed at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const writes = await setup(page);
    await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
    const baseline = await page.evaluate(() => sessionStorage.getItem('worship-state'));
    await expect(page.getByRole('complementary', { name: '처음 사용 안내' })).toBeVisible();
    await page.getByRole('button', { name: '사용 안내 시작', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '버튼 사용 안내', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('먼저 예배 자료를 준비하세요');
    await expect(dialog.getByRole('button', { name: '이전', exact: true })).toBeDisabled();
    const button = (await page.locator('[data-guide="edit"]').boundingBox())!;
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await expect(page.locator('[data-guide="edit"]')).toHaveAttribute('aria-pressed', 'false');
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    await dialog.getByRole('button', { name: '이전', exact: true }).click();
    const targets = ['[data-guide="edit"]', '[data-guide="add-order"]', '[data-guide="order"]', '[data-guide="slides"]', '[data-guide="slide-edit"]', '.audio-source-field .choice-buttons-options', '[data-guide="save"]', '[data-guide="download"]', '[data-guide="output"]'];
    for (let i = 0; i < targets.length; i++) {
      await expect(page.locator('[data-guide-active]')).toHaveCount(1);
      await expect(page.locator(targets[i])).toHaveAttribute('data-guide-active', 'true');
      await expect.poll(async () => {
        const panel = await page.locator('.guide-panel').boundingBox();
        const spot = await page.locator('.guide-spotlight').boundingBox();
        const target = await page.locator(targets[i]).boundingBox();
        if (!panel || !spot || !target) return false;
        const fits = panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= viewport.width && panel.y + panel.height <= viewport.height;
        const separate = panel.x >= spot.x + spot.width || panel.x + panel.width <= spot.x || panel.y >= spot.y + spot.height || panel.y + panel.height <= spot.y;
        const aligned = Math.abs(spot.x - Math.max(2, target.x - 5)) < 2 && Math.abs(spot.y - Math.max(2, target.y - 5)) < 2;
        return fits && separate && aligned && target.y >= 0 && target.y + target.height <= viewport.height;
      }).toBe(true);
      if ([0, 3, 8].includes(i)) await page.screenshot({ path: `artifacts/usage-guide-${viewport.width}-${i}.png` });
      // These are presentation shortcuts outside the guide.
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('b');
      if (i < targets.length - 1) await dialog.getByRole('button', { name: '다음', exact: true }).click();
    }
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.usage-guide-dialog'))).toBe(true);
    await dialog.getByRole('button', { name: '안내 마치기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-guide-active]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '사용 안내', exact: true })).toBeFocused();
    expect(await page.evaluate(() => sessionStorage.getItem('worship-state'))).toBe(baseline);
    await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeDisabled();
    expect(writes()).toBe(0);
    await page.reload(); await expect(page.locator('.queue-edit-toggle')).toBeVisible();
    await expect(page.getByRole('complementary', { name: '처음 사용 안내' })).toHaveCount(0);
    await page.getByRole('button', { name: '사용 안내', exact: true }).click();
    await expect(dialog).toBeVisible(); await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '사용 안내', exact: true })).toBeFocused();
  });
}

test('welcome can be dismissed and empty libraries only show available actions, including import in edit mode', async ({ page }) => {
  await setup(page, emptyManifest);
  await page.getByRole('button', { name: '처음 사용 안내 닫기', exact: true }).click();
  await page.reload(); await expect(page.locator('.queue-edit-toggle')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '처음 사용 안내' })).toHaveCount(0);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await page.getByRole('button', { name: '사용 안내', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '버튼 사용 안내' });
  await dialog.getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog.getByRole('heading')).toHaveText('이 PC의 자료를 불러오세요');
  await expect(page.locator('.queue-library-tools .queue-file-import')).toHaveAttribute('data-guide-active', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const box = await page.locator('.guide-panel').boundingBox();
    return !!box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844;
  }).toBe(true);
  const titles: string[] = [];
  while (await dialog.getByRole('button', { name: '다음', exact: true }).count()) {
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    titles.push(await dialog.getByRole('heading').innerText());
  }
  expect(titles).not.toContain('진행할 예배 순서를 선택하세요');
  expect(titles).not.toContain('순서마다 보여 줄 장을 정하세요');
  expect(titles).not.toContain('PPT 문구를 바로 수정하세요');
  await dialog.getByRole('button', { name: '사용 안내 닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '편집 모드 종료', exact: true })).toBeVisible();
  await expect(page.locator('.queue-card')).toHaveCount(0);
});
