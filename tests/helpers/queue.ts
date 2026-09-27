import { type Page } from '@playwright/test';

export async function editSection(page: Page, index: number) {
  await page.locator('.queue-edit-toggle').waitFor({ state: 'visible' });
  const enter = page.getByRole('button', { name: '편집 모드', exact: true });
  if (await enter.count()) await enter.click();
  const toggle = page.getByRole('button', { name: `PPT 섹션 ${index} 편집`, exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}
export async function renameCard(page: Page, oldTitle: string, title: string, cardNumber?: number) {
  await page.locator('.queue-edit-toggle').waitFor({ state: 'visible' });
  const enter = page.getByRole('button', { name: '편집 모드', exact: true });
  if (await enter.count()) await enter.click();
  const card = cardNumber ? page.locator('.queue-card').nth(cardNumber - 1) : page;
  await card.getByRole('button', { name: `${oldTitle} 순서 이름 수정`, exact: true }).click();
  await page.getByRole('textbox', { name: '예배 순서 이름', exact: true }).fill(title);
  await page.getByRole('button', { name: '이름 적용', exact: true }).click();
}
