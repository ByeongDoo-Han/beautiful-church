import { operatorPassword } from './operator-credentials.mjs';
// Authenticate for local editing while isolating fixture-based smoke tests from
// the published library. Server mutations are blocked even if clicked by mistake.
export async function startLocalAdminDraft(page, base) {
  const response = await page.request.post(`${base}/api/login`, {
    headers: { origin: new URL(base).origin }, data: { username: 'admin', password: operatorPassword() },
  });
  if (!response.ok()) throw new Error(`Smoke login failed: ${response.status()}`);
  await page.route('**/api/manifest', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { manifest: { version: 1, title: '로컬 검증 예배', assets: [], items: [] }, etag: null } })
    : route.abort());
  await page.route('**/api/upload', route => route.abort());
}
