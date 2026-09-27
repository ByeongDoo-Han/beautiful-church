import { startLocalAdminDraft } from './smoke-draft.mjs';
// Live YouTube check using the official IFrame API demonstration video.
// Uses a fresh browser and a local PPTX import; never writes the server library.
import { chromium, expect } from '@playwright/test';
const baseURL = process.env.YOUTUBE_TEST_BASE_URL || 'http://127.0.0.1:3198';
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  await startLocalAdminDraft(page, baseURL);
  await page.goto(`${baseURL}/admin`);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles('public/demo/welcome.pptx');
  await page.getByRole('group', { name: 'welcome 재생 방식', exact: true }).getByRole('button', { name: '유튜브 링크 · 화면 1', exact: true }).click();
  await page.getByLabel('welcome 유튜브 링크', { exact: true }).fill('https://youtu.be/M7lc1UVf-VE?t=12');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await page.getByRole('button', { name: /welcome/ }).click();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup;
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('우리 함께 예배합니다');
  await output.getByRole('button', { name: '슬라이드만 표시', exact: true }).click();
  await expect(output.locator('.output-setup')).toHaveCount(0);
  await expect(output.locator('iframe, audio, video')).toHaveCount(0);
  await page.bringToFront(); await page.locator('.youtube-frame').scrollIntoViewIfNeeded();
  const frame = page.frameLocator('.youtube-frame iframe');
  await frame.getByRole('button', { name: /재생|Play/ }).first().click({ timeout: 30000 });
  await expect(page.locator('.youtube-status')).toHaveText('재생 중', { timeout: 30000 });
  await expect.poll(() => frame.locator('video').first().evaluate(video => video.currentTime), { timeout: 15000 }).toBeGreaterThan(12);
  await page.locator('.youtube-card').screenshot({ path: 'artifacts/youtube-player-live.png' });
  await output.screenshot({ path: 'artifacts/youtube-output-slides.png' });
  console.log('PASS: actual YouTube video plays on screen 1; screen 2 has only the PPTX slide and no audio/video/iframe');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('찬양으로 마음을 모읍니다');
  console.log('PASS: lyric slide navigation remains independent of the YouTube player');
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await expect(page.locator('.youtube-status')).toHaveText('일시정지');
  await page.getByRole('group', { name: 'welcome 재생 방식', exact: true }).getByRole('button', { name: 'MP3 음원 파일', exact: true }).click();
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await expect(page.locator('.youtube-frame iframe')).toHaveCount(0);
  console.log('PASS: covering the player pauses playback; switching to MP3 removes the YouTube player');
} finally { await browser.close(); }
