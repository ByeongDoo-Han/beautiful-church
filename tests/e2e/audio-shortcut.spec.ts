import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/admin';

test.beforeEach(async ({ page }) => { await signIn(page.request); });

test('Space controls the selected MP3 without moving slides, repeating, or hijacking controls and editors', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup;
  const card = page.locator('[data-card-id="praise"] .queue-item');
  await card.click();
  const play = page.getByRole('button', { name: '찬양 재생', exact: true });
  const pause = page.getByRole('button', { name: '찬양 일시정지', exact: true });
  const paused = () => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused);
  await expect(play).toBeEnabled();
  await expect(page.locator('.console-footer')).toContainText('Space 찬양 재생·일시정지');
  await page.keyboard.press('Space'); await expect(pause).toBeVisible();
  expect(await paused()).toBe(false);
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('우리 함께 예배합니다');
  await expect(output.locator('audio')).toHaveCount(0);
  await page.keyboard.press('Space'); await expect(play).toBeVisible();
  expect(await paused()).toBe(true);
  await page.keyboard.down('Space'); await expect(pause).toBeVisible();
  await page.keyboard.down('Space'); await page.keyboard.up('Space');
  expect(await paused()).toBe(false);
  // The real Play/Pause button retains its native Space activation, exactly once.
  await pause.focus(); await page.keyboard.press('Space'); await expect(play).toBeVisible();
  expect(await paused()).toBe(true);
  await page.getByRole('slider', { name: '찬양 볼륨' }).focus(); await page.keyboard.press('Space');
  expect(await paused()).toBe(true);
  await page.getByRole('slider', { name: '찬양 진행바' }).focus(); await page.keyboard.press('Space');
  expect(await paused()).toBe(true);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  const name = page.getByRole('textbox', { name: '예배 이름', exact: true });
  await name.fill('찬양'); await name.press('End'); await name.press('Space');
  await expect(name).toHaveValue('찬양 '); expect(await paused()).toBe(true);
  await card.click(); await page.keyboard.press('Space'); expect(await paused()).toBe(true);
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await page.getByRole('button', { name: '사용 안내', exact: true }).click();
  await page.getByRole('region', { name: '사용 설명' }).focus(); await page.keyboard.press('Space');
  expect(await paused()).toBe(true); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  const text = dialog.getByRole('textbox', { name: '문구 1', exact: true });
  await text.fill('새 문구'); await text.press('Space'); await expect(text).toHaveValue('새 문구 ');
  expect(await paused()).toBe(true);
  page.once('dialog', d => d.accept()); await dialog.getByRole('button', { name: '취소', exact: true }).click();
  // The shortcut also works when no button is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Space'); await expect(pause).toBeVisible();
  // Switching cards stops the old track; Space without MP3 still advances slides.
  await page.locator('[data-card-id="welcome"] .queue-item').click();
  expect(await paused()).toBe(true);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Space'); await expect(page.locator('.slide-counter')).toHaveText('02/ 03');
  await expect(page.locator('.console-footer')).toContainText('Space 다음 슬라이드');
  await card.click(); await expect(play).toBeEnabled(); expect(await paused()).toBe(true);
  // A retained MP3 assignment is inactive when YouTube is the selected source.
  await page.getByRole('group', { name: '찬양 · 음향 리허설 재생 방식', exact: true }).getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Space'); await expect(page.locator('.slide-counter')).toHaveText('02/ 03');
});

test('Space during MP3 loading never queues playback or falls through to slide navigation', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/demo/tone.mp3', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.continue();
  });
  await page.goto('/admin');
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
  await page.locator('[data-card-id="praise"] .queue-item').click();
  await expect.poll(() => !!release).toBe(true);
  await expect(page.getByRole('button', { name: '찬양 재생', exact: true })).toBeDisabled();
  await page.keyboard.press('Space');
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
  release!();
  await expect(page.getByRole('button', { name: '찬양 재생', exact: true })).toBeEnabled();
  expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '찬양 일시정지', exact: true })).toBeVisible();
  await expect(page.locator('.slide-counter')).toHaveText('01/ 03');
});
