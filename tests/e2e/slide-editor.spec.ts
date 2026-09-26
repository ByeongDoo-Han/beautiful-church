import { signIn } from '../helpers/admin';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await signIn(page.request); });
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { manifestSchema, type Manifest } from '../../src/lib/model';

test('text, copied slides and deletion synchronize only on apply, persist offline, and stay card-specific', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/admin');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('우리 함께 예배합니다');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click(); const output = await popup;
  const live = output.getByRole('img', { name: '출력 슬라이드' }); await expect(live).toContainText('우리 함께 예배합니다');
  await output.getByRole('button', { name: '슬라이드만 표시', exact: true }).click();
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  const title = dialog.locator('textarea').filter({ hasText: '우리 함께 예배합니다' });
  await expect(title).toBeVisible(); await title.fill('오늘 함께 찬양합니다');
  await expect(dialog.getByRole('img', { name: '편집 슬라이드 미리보기' })).toContainText('오늘 함께 찬양합니다');
  await expect(live).toContainText('우리 함께 예배합니다');
  await dialog.getByRole('button', { name: '슬라이드 복사·추가', exact: true }).click();
  await dialog.locator('textarea').filter({ hasText: '오늘 함께 찬양합니다' }).fill('추가한 찬양 가사 <우리 & 함께>');
  await expect(dialog.getByRole('img', { name: '편집 슬라이드 미리보기' })).toContainText('추가한 찬양 가사 <우리 & 함께>');
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await expect(live).toContainText('추가한 찬양 가사 <우리 & 함께>');
  await expect(page.locator('.slide-counter')).toContainText('/ 04');
  await page.getByRole('button', { name: '이전 슬라이드', exact: true }).click();
  await expect(current).toContainText('오늘 함께 찬양합니다');
  await page.getByRole('button', { name: /찬양 · 음향 리허설/ }).click();
  await expect(current).toContainText('우리 함께 예배합니다');
  await expect(page.locator('.slide-counter')).toContainText('/ 03');
  await page.getByRole('button', { name: /예배로의 초대/ }).click();
  await expect(live).toContainText('오늘 함께 찬양합니다');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  await dialog.getByRole('button', { name: '슬라이드 삭제', exact: true }).click();
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await expect(live).toContainText('찬양으로 마음을 모읍니다');
  await expect(page.locator('.slide-counter')).toContainText('/ 03');
  // Cancel must leave the live deck unchanged, including deletions.
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  await dialog.getByRole('button', { name: '슬라이드 삭제', exact: true }).click();
  page.once('dialog', d => d.accept()); await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(live).toContainText('찬양으로 마음을 모읍니다');
  await expect(page.locator('.slide-counter')).toContainText('/ 03');
  await page.getByRole('button', { name: '이전 슬라이드', exact: true }).click();
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: '예배 자료 다운로드', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('준비 완료', { timeout: 60000 });
  const outputUrl = output.url();
  await context.setOffline(true); await page.reload(); await output.reload();
  await expect(page).toHaveURL(/\/login$/); await expect(output).toHaveURL(/\/login(?:#.*)?$/);
  await expect(current).toHaveCount(0);
  await context.setOffline(false); await page.goto('/admin'); await output.goto(outputUrl);
  // The signed-in administrator's draft was retained in its separate namespace.
  await expect(current).toContainText('오늘 함께 찬양합니다'); await expect(live).toContainText('오늘 함께 찬양합니다');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  await expect(dialog.locator('textarea').filter({ hasText: '오늘 함께 찬양합니다' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/slide-editor.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('the final slide cannot be removed and PDF fallback stays original', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  const remove = dialog.getByRole('button', { name: '슬라이드 삭제', exact: true });
  await remove.click(); await remove.click(); await expect(remove).toBeDisabled();
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await expect(page.locator('.slide-counter')).toContainText('/ 01');
  await page.getByRole('button', { name: 'PDF로 전환', exact: true }).click();
  await expect(page.locator('.current-preview canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '슬라이드 편집', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'PPTX로 돌아가기', exact: true }).click();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('함께 기도합니다');
  await expect(page.locator('.slide-counter')).toContainText('/ 01');
});

test('grouped text and table cells remain editable with safe multiline text', async ({ page }) => {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText('그룹 안의 문구', { x: 1, y: 1, w: 8, h: 1, fontSize: 28, color: '226644' });
  slide.addTable([[{ text: '표 안의 문구' }, { text: '유지할 문구' }]], { x: 1, y: 4, w: 10, h: 1, fontSize: 20 });
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }) as Buffer);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  zip.file('ppt/slides/slide1.xml', xml.replace(/<p:sp>.*?<\/p:sp>/s, shape => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="100" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>${shape}</p:grpSp>`));
  await page.goto('/admin'); await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByLabel('예배 파일 불러오기').setInputFiles({ name: 'group-table.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByRole('status')).toContainText('1개 파일');
  await page.getByRole('button', { name: '편집 완료', exact: true }).click();
  await page.getByRole('button', { name: /group-table/ }).click();
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('그룹 안의 문구');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  await dialog.locator('textarea').filter({ hasText: '그룹 안의 문구' }).fill('그룹 수정 첫 줄\n둘째 줄');
  await dialog.locator('textarea').filter({ hasText: '표 안의 문구' }).fill('<script>표 수정 & 안전한 글자</script>');
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await expect(current).toContainText('그룹 수정 첫 줄'); await expect(current).toContainText('둘째 줄');
  await expect(current).toContainText('<script>표 수정 & 안전한 글자</script>');
  await expect(current).toContainText('유지할 문구'); await expect(current.locator('script')).toHaveCount(0);
});

test('admin save persists edit metadata without uploading the original file again', async ({ page, browser, baseURL }) => {
  const buffer = await readFile('public/demo/welcome.pptx'); const id = createHash('sha256').update(buffer).digest('hex');
  let saved: Manifest = { version: 1, title: '저장 검증', assets: [{ id, name: 'welcome.pptx', kind: 'pptx', size: buffer.length, pathname: `media/${id}.pptx` }], items: [{ id: 'first', title: '첫 순서', presentationId: id }, { id: 'second', title: '둘째 순서' }] };
  let puts = 0; let uploads = 0;
  const connect = async (target: typeof page, authenticated = true) => {
    await target.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated } }));
    await target.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pptx` } }));
    await target.route('**/api/upload', r => { uploads++; return r.abort(); });
    await target.route('**/api/manifest', r => {
      if (r.request().method() === 'PUT') { saved = manifestSchema.parse(r.request().postDataJSON().manifest); puts++; }
      return r.fulfill({ json: { manifest: saved, etag: `v${puts}` } });
    });
  };
  await connect(page); await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await page.getByRole('button', { name: '둘째 순서 PPT 섹션 변경', exact: true }).click();
  await page.getByRole('group', { name: '둘째 순서 PPT 섹션', exact: true }).getByRole('button', { name: /^1\./ }).click();
  await page.getByRole('button', { name: '편집 완료', exact: true }).click();
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  await dialog.locator('textarea').filter({ hasText: '우리 함께 예배합니다' }).fill('서버에서 불러온 새 문구');
  await dialog.getByRole('button', { name: '슬라이드 복사·추가', exact: true }).click();
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  expect(puts).toBe(0);
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('서버 저장 완료');
  expect(puts).toBe(1); expect(saved.sections?.[0].itemIds).toEqual(['first', 'second']); expect(uploads).toBe(0); expect(saved.sections?.[0].presentationEdit?.slides).toHaveLength(4);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage(); await signIn(fresh.request); await connect(fresh, true); await fresh.goto(`${baseURL}/admin`);
    await expect(fresh.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('서버에서 불러온 새 문구');
    await expect(fresh.locator('.slide-counter')).toContainText('/ 04');
    await expect(fresh.locator('.library-source')).toContainText('서버 저장본');
    await expect(fresh.getByRole('button', { name: '슬라이드 편집', exact: true })).toBeVisible();
    const popup = fresh.waitForEvent('popup');
    await fresh.getByRole('button', { name: '출력창 열기', exact: true }).click();
    const output = await popup;
    await expect(output.getByRole('img', { name: '출력 슬라이드' })).toContainText('서버에서 불러온 새 문구');
    await fresh.reload();
    await expect(fresh.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('서버에서 불러온 새 문구');
    await fresh.getByRole('button', { name: /둘째 순서/ }).click();
    await expect(fresh.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('서버에서 불러온 새 문구');
    await expect(fresh.locator('.slide-hold-status')).toContainText('2/2번째 순서');
  } finally { await context.close(); }
});
