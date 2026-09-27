import { renameCard } from '../helpers/queue';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { manifestSchema, type Manifest } from '../../src/lib/model';
import { signIn } from '../helpers/admin';

async function library() {
  const file = await readFile('public/demo/welcome.pptx'); const id = createHash('sha256').update(file).digest('hex');
  const manifest: Manifest = { version: 1, title: '서버 기준 예배', assets: [{ id, name: 'welcome.pptx', kind: 'pptx', size: file.length, pathname: `media/${id}.pptx` }], items: [{ id: 'first', title: '첫 순서', presentationId: id }] };
  return { manifest, etag: 'v1' };
}
async function seedLegacy(page: Page, value: unknown) {
  await page.evaluate(async value => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('beautiful-church-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('metadata', 'readwrite'); tx.objectStore('metadata').put(value, 'cloud'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, value);
}

test('administrator starts from the current server version, recovers old cache explicitly, and retains its conflict protection', async ({ page, baseURL }) => {
  await signIn(page.request);
  let published = await library(); let gets = 0; let puts = 0; let attemptedEtag = '';
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pptx` } }));
  await page.route('**/api/manifest', r => {
    if (r.request().method() === 'PUT') { puts++; attemptedEtag = r.request().postDataJSON().etag; return r.fulfill({ status: 409, json: { error: '다른 운영자가 수정했습니다.' } }); }
    gets++; return r.fulfill({ json: published });
  });
  await page.goto('/admin'); await expect(page.locator('.service-summary h2')).toHaveText('서버 기준 예배');
  await seedLegacy(page, { manifest: { ...published.manifest, title: '이전 PC 편집본' }, etag: 'v0' });
  await page.reload(); await expect(page.locator('.service-summary h2')).toHaveText('서버 기준 예배');
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '서버 저장', exact: true })).toBeDisabled();
  published = { ...published, etag: 'v2', manifest: { ...published.manifest, title: '다른 PC에서 저장한 최신 예배' } };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.service-summary h2')).toHaveText('다른 PC에서 저장한 최신 예배');
  await page.getByRole('button', { name: '미저장 편집본 복구', exact: true }).click();
  await expect(page.locator('.service-summary h2')).toHaveText('이전 PC 편집본');
  const before = gets; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.service-summary h2')).toHaveText('이전 PC 편집본'); expect(gets).toBe(before);
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('다른 운영자가 수정했습니다');
  expect(puts).toBe(1); expect(attemptedEtag).toBe('v0');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '서버 자료 다시 불러오기', exact: true }).click();
  await expect(page.locator('.service-summary h2')).toHaveText('다른 PC에서 저장한 최신 예배');
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toBeVisible();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '편집본 삭제', exact: true }).click();
  await page.reload(); await expect(page.locator('.service-summary h2')).toHaveText('다른 PC에서 저장한 최신 예배');
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toHaveCount(0);
});

test('recovers a weak-ETag slide draft without a false outdated warning and saves it', async ({ page, baseURL }) => {
  await signIn(page.request);
  let published = { ...await library(), etag: '"v1"' };
  await page.route('**/api/config', r => r.fulfill({ json: { cloud: true, authenticated: true } }));
  await page.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pptx` } }));
  await page.route('**/api/manifest', r => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON();
      expect(body.etag).toBe('W/"v1"');
      published = { manifest: manifestSchema.parse(body.manifest), etag: '"v2"' };
    }
    return r.fulfill({ json: published });
  });
  await page.goto('/admin');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('우리 함께 예배합니다');
  const draft = structuredClone(published);
  draft.etag = 'W/"v1"';
  draft.manifest.items[0].presentationEdit = {
    assetId: draft.manifest.assets[0].id, version: crypto.randomUUID(),
    slides: [{ id: 'recovered-slide', source: 0, texts: { 'text-0': '복구한 슬라이드 문구' } }],
  };
  await seedLegacy(page, draft); await page.reload();
  await page.getByRole('button', { name: '미저장 편집본 복구', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toHaveText('미저장 편집본을 복구했습니다. 서버 저장을 누르기 전까지 다른 사용자에게 반영되지 않습니다.');
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('복구한 슬라이드 문구');
  await page.getByRole('button', { name: '서버 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장완료', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('img', { name: '현재 슬라이드 미리보기' })).toContainText('복구한 슬라이드 문구');
  await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toHaveCount(0);
});

test('unsaved edits stay separate from offline/server views, then saving makes two authenticated devices identical', async ({ page, context, browser, baseURL }) => {
  await signIn(page.request); let published = await library(); let puts = 0; let disconnected = false;
  const connect = async (target: Page, administrator: boolean) => {
    await target.route('**/api/config', r => disconnected ? r.abort() : r.fulfill({ json: { cloud: true, authenticated: administrator } }));
    await target.route('**/api/signed-url*', r => r.fulfill({ json: { url: `${baseURL}/demo/welcome.pptx` } }));
    await target.route('**/api/manifest', r => {
      if (disconnected) return r.abort();
      if (r.request().method() === 'PUT') {
        const body = r.request().postDataJSON();
        if (body.etag !== published.etag) return r.fulfill({ status: 409, json: { error: '저장 충돌' } });
        published = { manifest: manifestSchema.parse(body.manifest), etag: `v${++puts + 1}` };
      }
      return r.fulfill({ json: published });
    });
  };
  await connect(page, true); await page.goto('/admin');
  const current = page.getByRole('img', { name: '현재 슬라이드 미리보기' });
  await expect(current).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '슬라이드 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '슬라이드 편집', exact: true });
  await dialog.locator('textarea').filter({ hasText: '우리 함께 예배합니다' }).fill('모든 화면에서 같은 서버 문구');
  await dialog.getByRole('button', { name: '슬라이드 복사·추가', exact: true }).click();
  await dialog.getByRole('button', { name: '화면에 적용', exact: true }).click();
  await expect(page.locator('.library-source')).toContainText('미저장 편집 중');
  await page.getByRole('button', { name: '이전 슬라이드', exact: true }).click();
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: '예배 자료 다운로드', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('준비 완료', { timeout: 60000 });
  // The published cache must not be replaced by the administrator's download of a draft.
  disconnected = true; await context.setOffline(true); await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(current).toHaveCount(0);
  disconnected = false; await context.setOffline(false); await page.goto('/admin');
  await expect(current).toContainText('우리 함께 예배합니다');
  await page.getByRole('button', { name: '미저장 편집본 복구', exact: true }).click();
  await expect(current).toContainText('모든 화면에서 같은 서버 문구');
  const originalAssets = structuredClone(published.manifest.assets);
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await page.getByRole('button', { name: '첫 순서 순서 이름 수정', exact: true }).click();
  await page.getByRole('textbox', { name: '예배 순서 이름', exact: true }).fill('   ');
  await expect(page.getByRole('button', { name: '이름 적용', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '예배 순서 이름', exact: true }).fill('동기화된 첫 순서');
  await page.getByRole('button', { name: '이름 적용', exact: true }).click();
  await expect(page.locator('[data-card-id="first"] .queue-copy strong')).toHaveText('동기화된 첫 순서');
  await expect(page.locator('[data-card-id="first"] .queue-file-name')).toHaveText('welcome.pptx');
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  await page.getByRole('button', { name: '편집 모드', exact: true }).click();
  await page.getByLabel('예배 이름', { exact: true }).fill('동기화된 예배 이름');
  await expect(page.locator('.queue-copy strong').first()).toHaveText('동기화된 첫 순서');
  await page.getByRole('button', { name: '예배 순서 추가', exact: true }).click();
  await renameCard(page, '새 예배 순서', '함께 저장한 두 번째 순서');
  await page.getByRole('button', { name: '편집 모드 종료', exact: true }).click();
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage(); await signIn(guest.request); await connect(guest, true); await guest.goto(`${baseURL}/admin`);
    const guestPreview = guest.getByRole('img', { name: '현재 슬라이드 미리보기' });
    await expect(guestPreview).toContainText('우리 함께 예배합니다'); expect(puts).toBe(0);
    // Manual sync reads the published version even while an admin has an unsaved draft.
    await guest.getByRole('button', { name: '서버 자료 다시 불러오기', exact: true }).click();
    await expect(guest.locator('.notice[role=status]')).toContainText('서버 저장본을 불러왔습니다');
    await expect(guest.locator('.service-summary h2')).toHaveText('서버 기준 예배');
    await expect(guestPreview).toContainText('우리 함께 예배합니다');
    await page.getByRole('button', { name: '서버 저장', exact: true }).click();
    await expect(page.locator('.notice[role=status]')).toContainText('서버 저장 완료');
    expect(puts).toBe(1);
    expect(published.manifest.assets).toEqual(originalAssets);
    await guest.getByRole('button', { name: '서버 자료 다시 불러오기', exact: true }).click();
    await expect(guest.locator('.notice[role=status]')).toContainText('서버 저장본을 불러왔습니다');
    await expect(guest.locator('.service-summary h2')).toHaveText('동기화된 예배 이름');
    await expect(guest.locator('.view-heading h2')).toHaveText('동기화된 첫 순서');
    await expect(guest.locator('[data-card-id="first"] .queue-file-name')).toHaveText('welcome.pptx');
    await expect(guest.getByRole('button', { name: '동기화된 첫 순서 순서 이름 수정', exact: true })).toHaveCount(0);
    await expect(guest.locator('#worship-sidebar')).toContainText('함께 저장한 두 번째 순서');
    await expect(guestPreview).toContainText('모든 화면에서 같은 서버 문구');
    await page.reload(); await expect(current).toContainText('모든 화면에서 같은 서버 문구');
    await expect(page.getByRole('button', { name: '미저장 편집본 복구', exact: true })).toHaveCount(0);
    await expect(page.locator('.slide-counter')).toContainText('/ 04');
    await expect(guest.locator('.slide-counter')).toContainText('/ 04');
    await expect(guest.getByRole('button', { name: '슬라이드 편집', exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/server-source-admin.png', fullPage: true });
  } finally { await guestContext.close(); }
});
