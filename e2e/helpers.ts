import type { Page } from '@playwright/test';

export async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('共同口令').fill('playwright shared passphrase');
  await page.getByLabel('再次输入').fill('playwright shared passphrase');
  await page.getByLabel('初见日期').fill('2023-03-15');
  await page.getByLabel('在一起日期').fill('2024-01-01');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await page.getByLabel('武汉大学地点地图').waitFor({ state: 'visible' });
}
