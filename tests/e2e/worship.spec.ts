import { signIn } from '../helpers/admin';
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await signIn(page.request); });
import path from 'node:path';
async function openConsole(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await expect(page.getByRole('button', { name: '다음 슬라이드', exact: true })).toBeEnabled();
}
async function launch(page: Page) { const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click(); const popup = await popupPromise; await expect(popup.getByRole('img', { name: '출력 슬라이드' })).toContainText('우리 함께 예배합니다'); return popup; }
test('PPTX renders, output synchronizes, blackout and reconnect work', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openConsole(page); const output = await launch(page);
  await output.getByRole('button', { name: '슬라이드만 표시', exact: true }).click();
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: '화면 가리기', exact: true }).click(); await expect(output.locator('.output-slide')).toHaveCSS('visibility', 'hidden');
  await page.getByRole('button', { name: '가림 해제', exact: true }).click();
  await page.reload(); await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click(); await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('함께 기도합니다');
  await output.reload(); await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('함께 기도합니다');
  await page.getByRole('button', { name: '출력창 닫기', exact: true }).click(); await expect.poll(() => output.isClosed()).toBe(true);
  expect(errors).toEqual([]);
});
test('PDF.js fallback renders in both windows and MP3 remains operator-only', async ({ page }) => {
  await openConsole(page); const output = await launch(page);
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  const play = page.getByRole('button', { name: '찬양 재생', exact: true }); await expect(play).toBeEnabled(); await play.click();
  await expect(page.getByRole('button', { name: '찬양 일시정지', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: '찬양 볼륨' }).fill('0.35');
  expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(.35);
  await page.getByRole('slider', { name: '찬양 진행바' }).fill('6');
  expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(6);
  await page.getByRole('button', { name: '찬양 일시정지', exact: true }).click();
  await page.getByRole('button', { name: 'PDF로 전환', exact: true }).click();
  await expect(page.locator('.current-preview canvas')).toBeVisible(); await expect(output.locator('canvas')).toHaveCount(1);
  expect(await output.locator('audio').count()).toBe(0);
  await page.getByRole('button', { name: /함께 드리는 기도/ }).click(); expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
});
test('real file import persists and can be paired in the editor', async ({ page }) => {
  await openConsole(page); await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles(['welcome.pptx', 'welcome.pdf', 'tone.mp3'].map(f => path.resolve('public/demo', f)));
  await expect(page.getByRole('status')).toContainText('3개 파일');
  const title = page.getByRole('textbox', { name: '항목 4 제목' }); await title.fill('새 찬양');
  await page.getByRole('group', { name: '새 찬양 찬양 MP3', exact: true }).getByRole('button', { name: 'tone.mp3', exact: true }).click();
  await page.getByRole('group', { name: 'PPT 섹션 4 대체 PDF', exact: true }).getByRole('button', { name: 'welcome.pdf', exact: true }).click();
  await page.getByRole('button', { name: '편집 완료', exact: true }).click(); await page.getByRole('button', { name: /04 새 찬양/ }).click();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다'); await page.reload();
  await expect(page.getByRole('button', { name: /04 새 찬양/ })).toBeVisible(); await expect(page.getByRole('button', { name: '찬양 재생', exact: true })).toBeEnabled();
});
test('authenticated open screens render PDF and play MP3 offline; reopening requires login', async ({ page, context }) => {
  await openConsole(page); await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: '예배 자료 다운로드', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('준비 완료', { timeout: 60000 });
  const output = await launch(page); await context.setOffline(true);
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다'); await page.getByRole('button', { name: 'PDF로 전환', exact: true }).click();
  await expect(output.locator('canvas')).toHaveCount(1); await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await page.getByRole('button', { name: '찬양 재생', exact: true }).click(); await expect(page.getByRole('button', { name: '찬양 일시정지', exact: true })).toBeVisible();
});
test('postMessage fallback works when BroadcastChannel is unavailable', async ({ page, context }) => {
  await context.addInitScript(() => { Reflect.deleteProperty(window, 'BroadcastChannel'); });
  await openConsole(page); const output = await launch(page); await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('찬양으로 마음을 모읍니다');
  await page.reload();
  await expect(page.locator('.connection-bar')).toContainText('창 모드 연결됨');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('함께 기도합니다');
});
test('popup blocked, unsupported screens and denied permissions expose recovery', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'getScreenDetails', { configurable: true, value: undefined }); window.open = () => null; });
  await openConsole(page); await expect(page.getByRole('button', { name: '수동 모니터 이동', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '출력창 열기', exact: true }).click(); await expect(page.getByRole('status')).toContainText('팝업이 차단');
  await page.evaluate(() => Object.defineProperty(window, 'getScreenDetails', { configurable: true, value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }));
  // Feature detection runs at mount, so use a new document with the denial mock.
  await page.addInitScript(() => Object.defineProperty(window, 'getScreenDetails', { configurable: true, value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }));
  await page.reload(); await page.getByRole('button', { name: '두 번째 화면 자동 선택', exact: true }).click(); await expect(page.getByRole('status')).toContainText('화면 권한을 사용할 수 없습니다');
});
test('fullscreen rejection asks for a direct click; real fullscreen state is reported', async ({ page }) => {
  await openConsole(page); const output = await launch(page);
  await output.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await page.getByRole('button', { name: '전체화면 요청', exact: true }).click();
  await expect(output.getByText('전체화면은 출력창에서 직접 클릭해야 할 수 있습니다.', { exact: false })).toBeVisible();
  await output.evaluate(() => { Reflect.deleteProperty(document.documentElement, 'requestFullscreen'); });
  await output.getByRole('button', { name: '전체화면 시작', exact: true }).click();
  await expect.poll(() => output.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('.connection-bar')).toContainText('전체화면 출력 중');
  await page.getByRole('button', { name: '출력창 전체화면 해제', exact: true }).click();
  await expect.poll(() => output.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
test('unconfigured cloud APIs fail closed and foreign-origin mutations are rejected', async ({ request }) => {
  for (const route of ['/api/manifest', '/api/signed-url?id=demo-pptx']) expect([401, 503]).toContain((await request.get(route)).status());
  const r = await request.post('/api/login', { headers: { origin: 'https://attacker.example' }, data: { password: 'wrong' } }); expect(r.status()).toBe(403);
  expect((await request.put('/api/manifest', { headers: { origin: 'https://attacker.example' }, data: {} })).status()).toBe(403);
});
test('a damaged PPTX can be replaced by its linked PDF without a server converter', async ({ page }) => {
  await openConsole(page); await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles({ name: 'damaged.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('PK-damaged-not-a-real-zip') });
  await expect(page.getByRole('status')).toContainText('1개 파일');
  await page.getByRole('group', { name: 'PPT 섹션 4 대체 PDF', exact: true }).getByRole('button', { name: '예배 안내.pdf', exact: true }).click();
  await page.getByRole('button', { name: '편집 완료', exact: true }).click(); await page.getByRole('button', { name: /04 damaged/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'PDF로 전환', exact: true }).click(); await expect(page.locator('.current-preview canvas')).toBeVisible();
  await page.reload(); await expect(page.locator('.current-preview canvas')).toBeVisible();
});
test('capture console for delivery', async ({ page }) => {
  await openConsole(page); await expect(page.getByRole('img', { name: '다음 슬라이드 미리보기' })).toContainText('찬양으로 마음을 모읍니다');
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await expect(page.getByRole('button', { name: '찬양 재생', exact: true })).toBeEnabled();
  await page.locator('.audio-controls').scrollIntoViewIfNeeded();
  await expect(page.locator('.audio-controls')).toBeVisible();
  await page.screenshot({ path: 'artifacts/operator-console.png', fullPage: true });
});
