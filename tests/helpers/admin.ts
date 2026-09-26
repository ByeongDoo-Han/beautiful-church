import { TEST_PASSWORD } from './credentials';
import { expect, type APIRequestContext } from '@playwright/test';
export async function signIn(request: APIRequestContext) {
  const config = await request.get('/api/config');
  const response = await request.post('/api/login', {
    headers: { origin: new URL(config.url()).origin }, data: { username: 'admin', password: TEST_PASSWORD },
  });
  expect(response.ok()).toBe(true);
}
