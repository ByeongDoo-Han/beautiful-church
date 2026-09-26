import { signIn } from '../helpers/admin';
import { test, expect } from '@playwright/test';

test('server library displays files, paginates, refreshes and recovers from a failed request', async ({ page }) => {
  await signIn(page.request);
  await page.route('**/api/config', route => route.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/manifest', route => route.fulfill({ json: { manifest: { version: 1, title: '주일예배', assets: [], items: [] }, etag: null } }));
  let fail = false; let empty = false;
  await page.route('**/api/files*', route => {
    if (fail) return route.fulfill({ status: 503, json: { error: '서버에 연결할 수 없습니다.' } });
    const next = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { files: empty ? [] : next ? [
      { pathname: 'media/orphan.pptx', name: 'orphan.pptx', kind: 'pptx', size: 2097152, uploadedAt: '2026-09-20T01:00:00Z', registered: false },
    ] : [{ pathname: 'media/song.mp3', name: '주일 찬양.mp3', kind: 'mp3', size: 1048576, uploadedAt: '2026-09-20T00:00:00Z', registered: true }], nextCursor: next || empty ? null : 'page-2' } });
  });
  await page.goto('/admin');
  const trigger = page.getByRole('button', { name: '서버 파일 목록', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '서버 파일 목록', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row', { name: /주일 찬양.mp3/ })).toContainText('1.0 MB');
  await expect(dialog).toContainText('예배 목록에 등록');
  await dialog.getByRole('button', { name: '파일 더 불러오기' }).click();
  await expect(dialog).toContainText('orphan.pptx');
  await expect(dialog).toContainText('2개 파일 · 3.0 MB');
  await expect(dialog.getByRole('button', { name: '파일 더 불러오기' })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toContainText('주일 찬양.mp3');
  fail = true; await dialog.getByRole('button', { name: '새로고침' }).click();
  await expect(dialog.getByRole('alert')).toContainText('서버에 연결할 수 없습니다.');
  await expect(dialog).toContainText('주일 찬양.mp3');
  fail = false; empty = true;
  await dialog.getByRole('button', { name: '새로고침' }).click();
  await expect(dialog).toContainText('서버에 저장된 파일이 없습니다.');
  await expect(dialog.getByRole('table')).toHaveCount(0);
});
