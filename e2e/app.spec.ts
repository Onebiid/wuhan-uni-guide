import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('creates an encrypted workspace and completes the core map-memory flow', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Content Security Policy')) consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我们的武大' })).toBeVisible();
  await page.getByLabel('共同口令').fill('playwright shared passphrase');
  await page.getByLabel('再次输入').fill('playwright shared passphrase');
  await page.getByLabel('初见日期').fill('2023-03-15');
  await page.getByLabel('在一起日期').fill('2024-01-01');
  await page.getByRole('button', { name: '创建并进入' }).click();

  await expect(page.getByLabel('武汉大学地点地图')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
  const firstTile = page.locator('.leaflet-tile-loaded').first();
  await expect(firstTile).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('武汉大学地点地图')).toHaveAttribute('data-tile-status', 'ready');
  await expect(firstTile).toHaveCSS('opacity', '1');
  const tileStats = await sharp(await firstTile.screenshot()).stats();
  expect(Math.max(...tileStats.channels.slice(0, 3).map((channel) => channel.stdev))).toBeGreaterThan(8);
  await page.screenshot({ path: testInfo.outputPath('map-home.png'), fullPage: true });

  await page.getByRole('button', { name: '添加地点' }).click();
  await expect(page.getByText('移动地图让准星对准位置')).toBeVisible();
  await page.getByRole('button', { name: '确认位置' }).click();
  await page.getByLabel('名称').fill('测试约会地点');
  await page.getByLabel('备注').fill('适配 iPhone 15 Pro 的测试记录');
  await page.getByRole('button', { name: '保存地点' }).click();
  await expect(page.getByText('测试约会地点')).toBeVisible();

  await page.locator('.summary-main').click();
  await page.locator('.summary-actions').getByRole('button', { name: '回忆' }).click();
  await page.getByLabel('标题').fill('第一帧测试');
  await page.getByLabel('日期').fill('2026-07-20');
  await page.getByLabel('写下这一天').fill('地图与胶片册之间的完整流程。');
  await page.getByRole('button', { name: '存入回忆册' }).click();

  await page.locator('.bottom-nav').getByRole('button', { name: '回忆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第一帧测试' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('memory-book.png'), fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('keeps primary controls inside the iPhone viewport', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('.unlock-form');
  const box = await form.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(393);
  await expect(page.getByRole('button', { name: '创建并进入' })).toHaveCSS('min-height', '50px');
});

test('respects the reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '创建并进入' })).toHaveCSS('transition-duration', '0s');
});
