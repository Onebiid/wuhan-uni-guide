import { expect, test } from '@playwright/test';
import { createWorkspace } from './helpers';

test('captures the private-roll unlock state', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我们的武大' })).toBeVisible();
  await expect(page.getByText('ROLL 01 · TWO PEOPLE ONLY')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  await page.screenshot({ path: testInfo.outputPath('unlock-film.png'), fullPage: true });
});

test('keeps the film system inside the iPhone viewport', async ({ page }, testInfo) => {
  await createWorkspace(page);
  await expect(page.getByLabel('武汉大学地点地图')).toHaveAttribute('data-tile-status', 'ready', { timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  const header = await page.locator('.map-header').boundingBox();
  expect(header).not.toBeNull();
  expect(header?.height).toBeLessThanOrEqual(150);
  const nav = await page.locator('.bottom-nav').boundingBox();
  expect(nav).not.toBeNull();
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(852);
  await page.screenshot({ path: testInfo.outputPath('map-film.png'), fullPage: true });
});

test('keeps long place copy inside the selected ticket', async ({ page }, testInfo) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '添加地点' }).click();
  await page.getByRole('button', { name: '确认位置' }).click();
  const longName = '珞珈山樱花大道与老图书馆之间的雨后散步纪念地点';
  await page.getByLabel('名称').fill(longName);
  await page.getByLabel('备注').fill('一段用于验证地点票据在长文本下仍然保持边界、日期和操作按钮清晰可读的说明。');
  await page.getByRole('button', { name: '保存地点' }).click();
  const ticket = page.locator('.place-summary');
  await expect(ticket).toBeVisible();
  const ticketBox = await ticket.boundingBox();
  expect(ticketBox).not.toBeNull();
  expect(ticketBox?.x).toBeGreaterThanOrEqual(0);
  expect((ticketBox?.x ?? 0) + (ticketBox?.width ?? 0)).toBeLessThanOrEqual(393);
  await ticket.locator('.summary-main').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  await page.screenshot({ path: testInfo.outputPath('map-ticket.png'), fullPage: true });
});

test('shows an operational tile failure state', async ({ page }) => {
  await page.route('https://webrd0*.is.autonavi.com/**', (route) => route.abort());
  await createWorkspace(page);
  await expect(page.getByText('底图暂时未载入，地点仍可使用')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.map-marker')).toHaveCount(5);
});

test('shows and captures an unexposed empty roll', async ({ page }, testInfo) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '胶片', exact: true }).click();
  await expect(page.getByText('FRAME 000')).toBeVisible();
  await expect(page.getByRole('button', { name: '回到地图' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('memory-roll.png'), fullPage: true });
});

test('captures a keyboard-sized new-place sheet', async ({ page }, testInfo) => {
  await createWorkspace(page);
  await page.setViewportSize({ width: 393, height: 520 });
  await page.getByRole('button', { name: '添加地点' }).click();
  await page.getByRole('button', { name: '确认位置' }).click();
  const sheet = page.locator('.form-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(520);
  const saveButton = page.getByRole('button', { name: '保存地点' });
  await expect(saveButton).toBeVisible();
  const saveBox = await saveButton.boundingBox();
  expect(saveBox).not.toBeNull();
  expect(saveBox?.y).toBeGreaterThanOrEqual(0);
  expect((saveBox?.y ?? 0) + (saveBox?.height ?? 0)).toBeLessThanOrEqual(520);
  await page.screenshot({ path: testInfo.outputPath('keyboard-sheet.png'), fullPage: true });
});

test('captures soundtrack and archive settings', async ({ page }, testInfo) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '声音', exact: true }).click();
  await expect(page.getByText('OUR SOUNDTRACK · SIDE A')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('soundtrack.png'), fullPage: true });
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await expect(page.getByRole('heading', { name: '档案设置' })).toBeVisible();
  await expect(page.getByText('03 / SECURITY')).toBeVisible();
  await page.locator('.settings-page').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('archive-settings.png'), fullPage: true });
});

test('keeps primary commands coherent with enlarged text', async ({ page }) => {
  await createWorkspace(page);
  await page.evaluate(() => { document.body.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  for (const button of await page.locator('.bottom-nav button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('removes film motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createWorkspace(page);
  await expect(page.locator('.map-marker').first()).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.bottom-nav')).toHaveCSS('transition-duration', '0s');
});
