import { signIn } from '../helpers/admin';
import { test, expect, type Page } from '@playwright/test';
import { manifestSchema, type Manifest } from '../../src/lib/model';

test.beforeEach(async ({ page }) => { await signIn(page.request); });

async function connectYouTube(page: Page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await page.getByRole('group', { name: '찬양 · 음향 리허설 재생 방식', exact: true }).getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).click();
  await page.getByLabel('찬양 · 음향 리허설 유튜브 링크', { exact: true }).fill('https://youtu.be/M7lc1UVf-VE?t=12');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
}

test('inline links embed immediately; server save completes, changes enable saving, and failures can retry', async ({ page }) => {
  let published: { manifest: Manifest; etag: string } = { manifest: { version: 1, title: '링크 편집 예배', assets: [], items: [{ id: 'song', title: '찬양' }] }, etag: 'v1' };
  let failSave = false; let releaseSave: (() => void) | undefined;
  await page.route('**/api/config', route => route.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/manifest', async route => {
    if (route.request().method() === 'PUT') {
      await new Promise<void>(resolve => { releaseSave = resolve; });
      if (failSave) return route.fulfill({ status: 500, json: { error: '저장에 실패했습니다.' } });
      published = { manifest: manifestSchema.parse(route.request().postDataJSON().manifest), etag: 'v2' };
    }
    await route.fulfill({ json: published });
  });
  await page.goto('/admin');
  const inline = page.getByRole('region', { name: '선택한 예배 순서 음원 편집' });
  const save = page.getByRole('button', { name: '서버 저장', exact: true });
  await expect(save).toBeDisabled();
  await inline.getByRole('group', { name: '찬양 재생 방식', exact: true }).getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).click();
  const link = inline.getByLabel('찬양 유튜브 링크', { exact: true });
  await link.fill('https://youtu.be/M7lc1UVf-VE?t=12');
  await inline.getByRole('button', { name: '링크 적용', exact: true }).click();
  const frame = page.getByTitle('화면 1 유튜브 찬양 플레이어');
  await expect(frame).toHaveAttribute('src', /M7lc1UVf-VE.*start=12/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await save.click();
  await expect(page.getByRole('button', { name: '저장 중…', exact: true })).toBeDisabled();
  await expect(link).toBeDisabled();
  await expect.poll(() => !!releaseSave).toBe(true); releaseSave!();
  const saved = page.getByRole('button', { name: '저장완료', exact: true });
  await expect(saved).toBeDisabled();
  expect(published.manifest.items[0].youtube).toEqual({ videoId: 'M7lc1UVf-VE', startSeconds: 12 });
  const source = inline.getByRole('group', { name: '찬양 재생 방식', exact: true });
  await expect(source.getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await source.getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).click();
  await expect(saved).toBeDisabled();
  await link.fill('https://example.com/not-youtube');
  await inline.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(inline.getByRole('alert')).toBeVisible();
  await expect(saved).toBeDisabled();
  await expect(frame).toHaveAttribute('src', /M7lc1UVf-VE.*start=12/);
  // An equivalent URL does not make a saved manifest dirty.
  await link.fill('https://youtu.be/M7lc1UVf-VE?t=12');
  await inline.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(saved).toBeDisabled();
  await link.fill('https://youtu.be/dQw4w9WgXcQ?t=30');
  await inline.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(frame).toHaveAttribute('src', /dQw4w9WgXcQ.*start=30/);
  await expect(save).toBeEnabled();
  failSave = true; releaseSave = undefined;
  await save.click(); await expect.poll(() => !!releaseSave).toBe(true); releaseSave!();
  await expect(page.locator('.notice[role=status]')).toContainText('저장에 실패');
  await expect(save).toBeEnabled(); await expect(saved).toHaveCount(0);
  failSave = false; releaseSave = undefined;
  await save.click(); await expect.poll(() => !!releaseSave).toBe(true); releaseSave!();
  await expect(saved).toBeDisabled();
  await page.reload();
  await expect(frame).toHaveAttribute('src', /dQw4w9WgXcQ.*start=30/);
  await expect(save).toBeDisabled();
});

test.beforeEach(async ({ page }) => {
  // Deterministic player contract tests; live YouTube playback is checked separately.
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.__ytLog = []; window.__ytEvents = null;
    window.YT = { Player: class {
      constructor(frame, options) { this.frame = frame; this.events = options.events; window.__ytEvents = options.events; window.__ytLog.push('created'); setTimeout(() => this.events.onReady({ target: this }), 0); }
      pauseVideo() { window.__ytLog.push('paused'); this.events.onStateChange({ data: 2, target: this }); }
      destroy() { window.__ytLog.push('destroyed'); this.frame.remove(); }
    }};
    window.onYouTubeIframeAPIReady();
  ` }));
  await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="background:#222;color:white">YouTube player test double</body></html>' }));
});

test('YouTube stays on screen 1 while screen 2 shows only slides; card changes stop the player', async ({ page }) => {
  await connectYouTube(page);
  const player = page.getByRole('region', { name: '유튜브 찬양 플레이어' });
  // The player may start below the viewport, where visibility protection pauses it.
  await expect(player.locator('.youtube-status')).toHaveText(/재생 버튼을 눌러 주세요|일시정지/);
  const frame = page.getByTitle('화면 1 유튜브 찬양 플레이어');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect(frame).toHaveAttribute('src', /start=12/);
  expect(await page.locator('audio').count()).toBe(0);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup;
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('우리 함께 예배합니다');
  expect(await output.locator('iframe, audio').count()).toBe(0);
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('찬양으로 마음을 모읍니다');
  // Arrow keys select a source without also advancing the live slides.
  const source = page.getByRole('group', { name: '찬양 · 음향 리허설 재생 방식', exact: true });
  await source.getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).press('ArrowLeft');
  await expect(source.getByRole('button', { name: 'MP3 음원 파일', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(frame).toHaveCount(0);
  await source.getByRole('button', { name: 'MP3 음원 파일', exact: true }).press('ArrowRight');
  await expect(source.getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('찬양으로 마음을 모읍니다');
  await page.reload();
  await expect(page.getByTitle('화면 1 유튜브 찬양 플레이어')).toBeVisible();
  await page.getByRole('button', { name: /함께 드리는 기도/ }).click();
  await expect(frame).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __ytLog: string[] }).__ytLog)).toContain('destroyed');
  await output.close();
});

test('errors explain recovery, editing pauses YouTube, and switching to MP3 removes the iframe', async ({ page }) => {
  await connectYouTube(page);
  const player = page.getByRole('region', { name: '유튜브 찬양 플레이어' });
  await expect(player.locator('.youtube-status')).toHaveText(/재생 버튼을 눌러 주세요|일시정지/);
  await page.evaluate(() => (window as unknown as { __ytEvents: { onError: (e: { data: number }) => void } }).__ytEvents.onError({ data: 101 }));
  await expect(player.getByRole('alert')).toContainText('외부 사이트 재생');
  await player.getByRole('button', { name: '다시 시도' }).click();
  await expect(player.locator('.youtube-status')).toHaveText(/재생 버튼을 눌러 주세요|일시정지/);
  await expect(player.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __ytLog: string[] }).__ytLog)).toContain('paused');
  await page.getByRole('group', { name: '찬양 · 음향 리허설 재생 방식', exact: true }).getByRole('button', { name: 'MP3 음원 파일', exact: true }).click();
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await expect(page.getByTitle('화면 1 유튜브 찬양 플레이어')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '찬양 재생', exact: true })).toBeEnabled();
});
