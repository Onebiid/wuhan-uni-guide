import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createWorkspace } from './helpers';

test('creates an encrypted workspace and completes the core map-memory flow', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Content Security Policy')) consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('.unlock-view')).toContainText('ROLL 01');
  await expect(page.locator('.unlock-form')).toHaveCSS('box-shadow', 'none');
  await createWorkspace(page);
  await expect(page.getByLabel('视图切换')).toHaveCount(0);
  await expect(page.locator('.bottom-nav').getByRole('button', { name: '胶片', exact: true })).toBeVisible();
  const mapHeaderBox = await page.locator('.map-header').boundingBox();
  expect(mapHeaderBox).not.toBeNull();
  expect(mapHeaderBox?.height).toBeLessThanOrEqual(150);
  const filterBoxes = await page.locator('.filter-strip button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  for (const box of filterBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const markerBox = await page.locator('.map-marker-shell').first().boundingBox();
  expect(markerBox).not.toBeNull();
  expect(markerBox?.width).toBeGreaterThanOrEqual(44);
  expect(markerBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.film-map-heading')).toHaveCSS('pointer-events', 'none');
  const headingInterceptsMap = await page.locator('.film-map-heading').evaluate((heading) => {
    const box = heading.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && heading.contains(hit);
  });
  expect(headingInterceptsMap).toBe(false);
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

  const newPlaceTicket = page.getByRole('button', { name: '测试约会地点，NEW PLACE，DATE UNRECORDED，详情' });
  await expect(newPlaceTicket).toBeVisible();
  await expect(newPlaceTicket.locator('.film-thumb')).toBeVisible();
  await newPlaceTicket.click();
  await page.locator('.summary-actions').getByRole('button', { name: '回忆' }).click();
  await page.getByLabel('标题').fill('第一帧测试');
  await page.getByLabel('日期').fill('2026-07-20');
  await page.getByLabel('写下这一天').fill('地图与胶片册之间的完整流程。');
  await page.getByRole('button', { name: '存入回忆册' }).click();
  const frameNotice = page.getByRole('button', { name: '回忆已存入胶片册' });
  await expect(frameNotice).toHaveClass(/frame-saved/);
  await frameNotice.click();

  const unexposedTicket = page.getByRole('button', { name: '测试约会地点，FRAME 001，2026 / 07 / 20，收起' });
  await expect(unexposedTicket).toBeVisible();
  await expect(unexposedTicket.locator('.film-frame-media.unexposed')).toContainText('UNEXPOSED');

  await page.locator('.summary-actions').getByRole('button', { name: '回忆' }).click();
  await page.getByLabel('标题').fill('第二帧照片');
  await page.getByLabel('日期').fill('2026-07-21');
  await page.getByLabel('写下这一天').fill('这一帧带有加密照片。');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'frame.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: '存入回忆册' }).click();

  const photoTicket = page.getByRole('button', { name: '测试约会地点，FRAME 002，2026 / 07 / 21，收起' });
  await expect(photoTicket).toBeVisible();
  await expect(photoTicket.locator('.film-frame-media img')).toBeVisible();

  await page.locator('.bottom-nav').getByRole('button', { name: '胶片', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第一帧测试' })).toBeVisible();
  await expect(page.locator('.memory-card .film-frame-perforation b')).toHaveText(['FRAME 002', 'FRAME 001']);
  const firstMemoryFrame = page.locator('.memory-card').filter({ has: page.getByRole('heading', { name: '第一帧测试' }) }).locator('.film-frame');
  await expect(firstMemoryFrame).toContainText('FRAME 001');
  await expect(firstMemoryFrame.locator('.film-frame-media.unexposed')).toContainText('UNEXPOSED');
  await expect(page.getByLabel('视图切换')).toHaveCount(0);
  const [memoryScrollBox, memoryNavBox] = await Promise.all([
    page.locator('.memory-scroll').boundingBox(),
    page.locator('.bottom-nav').boundingBox(),
  ]);
  expect(memoryScrollBox).not.toBeNull();
  expect(memoryNavBox).not.toBeNull();
  if (!memoryScrollBox || !memoryNavBox) throw new Error('Memory scroll and navigation must have layout boxes');
  expect(memoryScrollBox.y + memoryScrollBox.height).toBeLessThanOrEqual(memoryNavBox.y);
  const memoryCardBoxes = await page.locator('.memory-card').evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(memoryCardBoxes).toHaveLength(2);
  for (const box of memoryCardBoxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(393);
  }
  for (let index = 0; index < memoryCardBoxes.length - 1; index += 1) {
    const current = memoryCardBoxes[index];
    const next = memoryCardBoxes[index + 1];
    if (!current || !next) throw new Error('Memory card geometry is incomplete');
    expect(current.y + current.height).toBeLessThanOrEqual(next.y);
  }
  await page.screenshot({ path: testInfo.outputPath('memory-book.png'), fullPage: true });
  await expect(page.getByRole('button', { name: '打开回忆：第一帧测试' })).toBeVisible();
  await expect(page.locator('.memory-card').first()).toHaveJSProperty('tagName', 'ARTICLE');
  await expect(page.locator('.memory-card button button')).toHaveCount(0);
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

test('keeps the new-frame sheet usable with a keyboard-sized viewport', async ({ page }) => {
  await createWorkspace(page);
  await page.setViewportSize({ width: 393, height: 520 });
  await page.getByRole('button', { name: '添加地点' }).click();
  await page.getByRole('button', { name: '确认位置' }).click();
  const sheet = page.locator('.form-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(520);
  await expect(page.getByRole('button', { name: '保存地点' })).toBeVisible();
});

test('uses soundtrack and archive-index presentation without changing commands', async ({ page }) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '声音', exact: true }).click();
  await expect(page.getByText('OUR SOUNDTRACK · SIDE A')).toBeVisible();
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上一首' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一首' })).toBeVisible();
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await expect(page.getByRole('heading', { name: '档案设置' })).toBeVisible();
  await expect(page.getByText('01 / RELATIONSHIP')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存日期' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^导入旧版 JSON/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^导出可读备份/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /立即锁定/ })).toBeVisible();
});

test('respects the reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '创建并进入' })).toHaveCSS('transition-duration', '0s');
});
