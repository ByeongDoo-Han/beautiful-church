import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/admin';
import { demoManifest } from '../../src/lib/model';

test('all console entry points require login and private APIs reject guests', async ({ page }) => {
  for (const route of ['/', '/admin', '/worship', '/output']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '아름다운교회 영아부', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '로그인 없이 보기' })).toHaveCount(0);
    await expect(page.locator('.console-main, .output-slide')).toHaveCount(0);
  }
  for (const route of ['/api/manifest', '/api/signed-url?id=demo-pptx', '/api/files']) {
    expect((await page.request.get(route)).status()).toBe(401);
  }
});

test('admin edit mode deletes cards and empty sections, preserves files and drafts across logout', async ({ page }) => {
  await signIn(page.request); await page.goto('/admin');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('우리 함께 예배합니다');
  await expect(page.locator('.queue-delete')).toHaveCount(0);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  const deletion = page.getByRole('button', { name: '예배로의 초대 카드 삭제', exact: true });
  page.once('dialog', d => d.dismiss()); await deletion.click();
  await expect(page.locator('[data-card-id="welcome"]')).toHaveCount(1);
  page.once('dialog', d => d.accept()); await deletion.click();
  await expect(page.locator('[data-card-id="welcome"]')).toHaveCount(0);
  await expect(page.locator('[data-section-id="welcome"]')).toContainText('0개 예배 순서');
  await expect(current).toContainText('우리 함께 예배합니다');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'PPT 섹션 1 삭제', exact: true }).click();
  await expect(page.locator('[data-section-id="welcome"]')).toHaveCount(0);
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await expect(page.locator('.queue-delete')).toHaveCount(0);
  await page.reload(); await expect(page.locator('[data-card-id="welcome"]')).toHaveCount(0);
  // The original PPT and MP3 remain available in the editor after card/section deletion.
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await expect(page.getByRole('group', { name: 'PPT 섹션 1 파일', exact: true }).getByRole('button', { name: '예배 안내.pptx', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '편집 완료', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-card-id="welcome"]')).toHaveCount(0);
  await signIn(page.request); await page.goto('/admin');
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toBeVisible();
  await expect(page.locator('[data-card-id="welcome"]')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/admin-readonly-edit-mode.png', fullPage: true });
});

test('session revocation closes an open editor and disables edits when the window regains focus', async ({ page }) => {
  await signIn(page.request);
  let authenticated = true;
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: false, authenticated } }));
  await page.goto('/admin');
  await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  authenticated = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toHaveCount(0);
});

test('an authenticated operator receives saved text, slide copies and deletions in both screens', async ({ page, context }) => {
  await signIn(page.request);
  const { withSections, patchSection } = await import('../../src/lib/sections');
  const { createPresentationEdit } = await import('../../src/lib/slide-edit');
  let published = withSections(demoManifest); let revision = 1; let fail = false; let writes = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/manifest', r => {
    if (r.request().method() !== 'GET') { writes++; return r.abort(); }
    return fail ? r.fulfill({ status: 503, json: { error: '연결 실패' } }) : r.fulfill({ json: { manifest: published, etag: `v${revision}` } });
  });
  await page.goto('/admin');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('우리 함께 예배합니다');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '출력창 열기', exact: true }).click();
  const output = await popup; const live = output.getByRole('img', { name: '출력 슬라이드' });
  await expect(live).toContainText('우리 함께 예배합니다');
  const edit = createPresentationEdit('demo-pptx', 3);
  // Use the actual title field from the fixture as shown by the existing editor tests.
  const xml = await page.evaluate(async () => {
    const response = await fetch('/demo/welcome.pptx'); return [...new Uint8Array(await response.arrayBuffer())];
  });
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(Buffer.from(xml));
  const fields = await page.evaluate(async (xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(doc.getElementsByTagNameNS('*', 'txBody')).map((body, index) => ({ key: `text-${index}`, text: body.textContent }));
  }, (await zip.file('ppt/slides/slide1.xml')!.async('string')));
  const title = fields.find(field => field.text?.includes('우리 함께 예배합니다'))!;
  edit.slides[0].texts = { [title.key]: '서버 저장 후 자동 반영' };
  edit.slides.splice(1, 0, { ...edit.slides[0], id: 'server-copy', texts: { [title.key]: '서버에서 복사한 장' } });
  published = withSections(patchSection(published, 'welcome', { presentationEdit: edit })); revision++;
  await page.bringToFront();
  // Polling must refresh a tab that stays open, without a reload.
  await expect(current).toContainText('서버 저장 후 자동 반영', { timeout: 25000 });
  await expect(live).toContainText('서버 저장 후 자동 반영');
  await expect(page.locator('.slide-counter')).toContainText('/ 04');
  await page.getByRole('button', { name: '다음 슬라이드', exact: true }).click();
  await expect(current).toContainText('서버에서 복사한 장'); await expect(live).toContainText('서버에서 복사한 장');
  const shortened = { ...edit, version: crypto.randomUUID(), slides: [edit.slides[0]] };
  published = withSections(patchSection(published, 'welcome', { presentationEdit: shortened })); revision++;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(current).toContainText('서버 저장 후 자동 반영');
  await expect(page.locator('.slide-counter')).toHaveText('01/ 01');
  await expect(live).toContainText('서버 저장 후 자동 반영');
  fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.notice[role=status]')).toContainText('최신 저장본 확인 실패');
  await expect(current).toContainText('서버 저장 후 자동 반영');
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(current).toContainText('서버 저장 후 자동 반영');
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: '예배 자료 다운로드', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('준비 완료', { timeout: 60000 });
  await context.setOffline(true);
  await expect(current).toContainText('서버 저장 후 자동 반영'); await expect(live).toContainText('서버 저장 후 자동 반영');
  await page.reload(); await output.reload();
  await expect(page).toHaveURL(/\/login$/); await expect(output).toHaveURL(/\/login(?:#.*)?$/);
  await expect(page.getByRole('button', { name: '슬라이드 편집', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '편집 모드', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});
