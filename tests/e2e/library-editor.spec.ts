import path from 'node:path';
import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/admin';

for (const viewport of [{ width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  test(`library close stays visible and adding cards keeps section count at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page.request);
    await page.goto('/admin');
    await expect(page.locator('.queue-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'PPT 섹션 1에 순서 추가', exact: true }).click();
    await expect(page.locator('.ppt-section')).toHaveCount(3);
    await page.getByRole('button', { name: '예배 순서 · 자료 편집', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '예배 자료 편집', exact: true });
    const close = dialog.getByRole('button', { name: '편집 닫기', exact: true });
    const original = (await close.boundingBox())!;
    for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: '빈 순서 추가', exact: true }).click();
    await expect(dialog.locator('.editor-section')).toHaveCount(3);
    await expect(dialog.locator('.editor-item')).toHaveCount(7);
    await page.getByLabel('예배 파일 불러오기').setInputFiles(path.resolve('public/demo/tone.mp3'));
    await expect(dialog.getByRole('status')).toContainText('1개 파일');
    await expect(dialog.locator('.editor-section')).toHaveCount(3);
    await expect(dialog.locator('.editor-item')).toHaveCount(8);
    await dialog.locator('.library-editor-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(async () => (await close.boundingBox())!.y).toBe(original.y);
    // A real hit test ensures the close control is not merely in the DOM or hidden by content.
    expect(await close.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.ppt-section')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('.queue-card')).toHaveCount(8);
    await expect(page.locator('.ppt-section')).toHaveCount(3);
  });
}
