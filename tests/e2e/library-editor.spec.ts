import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/admin';
import { editSection } from '../helpers/queue';
import { manifestSchema } from '../../src/lib/model';
import { withSections } from '../../src/lib/sections';

for (const viewport of [{ width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  test(`edit mode replaces the library dialog and preserves section names and files at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await signIn(page.request); await page.goto('/admin');
    await expect(page.locator('.ppt-section')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true })).toHaveCount(0);
    await expect(page.locator('.queue-section-editor')).toHaveCount(0);
    await page.getByRole('button', { name: 'PPT 섹션 추가', exact: true }).click();
    const added = page.locator('.ppt-section').last();
    await expect(added.locator('.ppt-section-file')).toHaveText('자료 미지정');
    await editSection(page, 4);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'PPT 섹션 4 이름', exact: true }).fill('찬양 시간');
    await page.getByRole('group', { name: 'PPT 섹션 4 파일', exact: true }).getByRole('button', { name: '예배 안내.pptx', exact: true }).click();
    await editSection(page, 1);
    await expect(page.locator('.queue-section-editor')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'PPT 섹션 4 이름', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
    await expect(page.locator('.queue-section-editor')).toHaveCount(0);
    await page.reload();
    await expect(added.locator('.ppt-section-identity strong')).toHaveText('찬양 시간');
    await expect(added.locator('.ppt-section-file')).toHaveText('예배 안내.pptx');
    await editSection(page, 4);
    await page.getByLabel('PPT 섹션 4 자료 불러오기', { exact: true }).setInputFiles(path.resolve('public/demo/welcome.pdf'));
    await expect(page.locator('.notice[role=status]')).toContainText('섹션 자료를 변경했습니다');
    await expect(page.locator('.ppt-section')).toHaveCount(4);
    await expect(page.locator('.queue-card')).toHaveCount(3);
    await expect(added.locator('.ppt-section-file')).toHaveText('welcome.pdf');
    await expect(added.locator('.ppt-section-identity strong')).toHaveText('찬양 시간');
    expect(await added.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await added.locator('.queue-section-editor').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/section-edit-mode-${viewport.width}.png` });
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '예배 순서 추가', exact: true }).click();
    await page.getByLabel('예배 파일 불러오기', { exact: true }).setInputFiles(path.resolve('public/demo/tone.mp3'));
    await expect(page.locator('.notice[role=status]')).toContainText('1개 파일');
    await expect(page.locator('.ppt-section')).toHaveCount(4);
    await expect(page.locator('.queue-card')).toHaveCount(7);
    await page.reload();
    await expect(page.locator('.queue-card')).toHaveCount(7);
    await expect(added.locator('.ppt-section-file')).toHaveText('welcome.pdf');
  });
}

test('inline section edits save and reload from the server and lock during saving', async ({ page, baseURL }) => {
  await signIn(page.request);
  const pdf = await readFile('public/demo/welcome.pdf'); const pdfId = createHash('sha256').update(pdf).digest('hex');
  let published = withSections({ version: 1, title: '서버 예배', assets: [{ id: pdfId, kind: 'pdf', name: '예배 안내.pdf', size: pdf.length, pathname: `media/${pdfId}.pdf` }], items: [{ id: 'welcome', title: '예배' }] }); let release: (() => void) | undefined;
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pdf` } }));
  await page.route('**/api/manifest', async r => {
    if (r.request().method() === 'PUT') {
      await new Promise<void>(resolve => { release = resolve; });
      published = withSections(manifestSchema.parse(r.request().postDataJSON().manifest));
    }
    await r.fulfill({ json: { manifest: published, etag: 'v1' } });
  });
  await page.goto('/admin'); await editSection(page, 1);
  const name = page.getByRole('textbox', { name: 'PPT 섹션 1 이름', exact: true });
  await name.fill('함께 드리는 예배');
  await page.getByRole('group', { name: 'PPT 섹션 1 파일', exact: true }).getByRole('button', { name: '예배 안내.pdf', exact: true }).click();
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  await expect(name).toBeDisabled();
  await expect(page.getByLabel('PPT 섹션 1 자료 불러오기', { exact: true })).toBeDisabled();
  await expect.poll(() => !!release).toBe(true); release!();
  await expect(page.getByRole('button', { name: '저장완료', exact: true })).toBeDisabled();
  expect(published.sections[0]).toMatchObject({ title: '함께 드리는 예배', presentationId: pdfId, itemIds: ['welcome'] });
  await page.reload();
  await expect(page.locator('.ppt-section').first().locator('.ppt-section-identity strong')).toHaveText('함께 드리는 예배');
  await expect(page.locator('.ppt-section').first().locator('.ppt-section-file')).toHaveText('예배 안내.pdf');
});
