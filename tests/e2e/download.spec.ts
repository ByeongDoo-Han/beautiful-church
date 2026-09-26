import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { signIn } from '../helpers/admin';

test.beforeEach(async ({ page }) => { await signIn(page.request); });
const button = (page: Page) => page.getByRole('button', { name: '예배 자료 다운로드', exact: true });

async function picker(page: Page, mode: 'save' | 'cancel' | 'failure') {
  await page.addInitScript(mode => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async (options: { suggestedName: string }) => {
      sessionStorage.setItem('picker', JSON.stringify({ options, active: navigator.userActivation.isActive }));
      if (mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      if (mode === 'failure') return { name: '선택한 이름.zip', createWritable: async () => {
        throw new DOMException('디스크에 저장할 수 없습니다.', 'NotAllowedError');
      } };
      const directory = await navigator.storage.getDirectory();
      return directory.getFileHandle('선택한 이름.zip', { create: true });
    } });
  }, mode);
}

test('chooses a destination before preparing files and writes a readable archive with slide edits', async ({ page }) => {
  await picker(page, 'save'); await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  await dialog.locator('textarea').filter({ hasText: '우리 함께 예배합니다' }).fill('다운로드에 포함할 수정 문구');
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await button(page).click();
  await expect(page.locator('.notice[role=status]')).toContainText('“선택한 이름.zip”을 선택한 위치에 저장했습니다.');
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('picker')!));
  expect(state.active).toBe(true); expect(state.options.suggestedName).toMatch(/예배자료\.zip$/);
  const bytes = await page.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('선택한 이름.zip')).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const info = JSON.parse(await zip.file('예배정보.json')!.async('string'));
  expect(info.files).toHaveLength(3);
  expect(JSON.stringify(info.manifest.sections[0].presentationEdit)).toContain('다운로드에 포함할 수정 문구');
  const pptx = info.files.find((f: { assetId: string }) => f.assetId === 'demo-pptx');
  expect(await zip.file(pptx.path)!.async('nodebuffer')).toEqual(await readFile('public/demo/welcome.pptx'));
  expect(await zip.file('안내.txt')!.async('string')).toContain('원본 PPTX 파일에는 반영되지 않습니다');
});

test('cancelling the location picker does not report success and allows retry', async ({ page }) => {
  await picker(page, 'cancel'); await page.goto('/admin');
  await expect(button(page)).toBeEnabled(); await button(page).click();
  await expect(page.locator('.notice[role=status]')).toHaveText('다운로드를 취소했습니다.');
  await expect(button(page)).toBeEnabled();
});

test('a destination write failure does not report a successful save', async ({ page }) => {
  await picker(page, 'failure'); await page.goto('/admin');
  await expect(button(page)).toBeEnabled(); await button(page).click();
  await expect(page.locator('.notice[role=status]')).toContainText('자료 저장 실패: 디스크에 저장할 수 없습니다.');
  await expect(button(page)).toBeEnabled();
});

test('unsupported browsers receive a real ZIP download and an accurate location notice', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.goto('/admin'); await expect(button(page)).toBeEnabled();
  const download = page.waitForEvent('download'); await button(page).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/예배자료\.zip$/);
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(zip.file('예배정보.json')).not.toBeNull();
  await expect(page.locator('.notice[role=status]')).toContainText('저장 위치는 브라우저 다운로드 설정을 따릅니다.');
});
