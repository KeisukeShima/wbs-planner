/**
 * E2E tests for Gantt chart sticky date header and label column resize.
 *
 * These tests are written TDD-first and will fail until Tasks 2–6 complete
 * the implementation (HTML structure, JS rendering, drag-resize logic).
 *
 * Features under test:
 *   - Date header stays fixed at top of viewport on vertical page scroll
 *   - Drag handle between label column and chart changes column width
 *   - Resized width is persisted to localStorage and restored on reload
 */

import { test, expect } from '@playwright/test';

const APP = '/wbs-planner.html';

test.describe('ガントチャート sticky ヘッダー & ラベル列リサイズ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for the gantt card to confirm the page loaded.
    // Individual tests will fail when they look for elements added in later tasks.
    await page.waitForSelector('#gantt-card');
  });

  test('date header sticks to top when page scrolls past it', async ({ page }) => {
    // Find natural document-offset of the date header
    const naturalTop = await page.locator('.gantt-date-hdr').evaluate(
      el => el.getBoundingClientRect().top + window.scrollY
    );
    // Scroll so its natural position is above the viewport
    await page.evaluate(y => window.scrollTo(0, y + 50), naturalTop);
    // Wait for one paint frame so CSS sticky has taken effect
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    // Guard: verify the page actually scrolled (prevents false-positive sticky assertion)
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const rect = await page.locator('.gantt-date-hdr').evaluate(
      el => el.getBoundingClientRect()
    );
    // Sticky: actual top should be ≈0, not negative
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.top).toBeLessThan(5);
  });

  test('drag resize handle changes label column width', async ({ page }) => {
    const handle = page.locator('#gantt-resize-handle');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const colWidth = await page.locator('#gantt-labels-col').evaluate(
      el => el.getBoundingClientRect().width
    );
    expect(colWidth).toBeGreaterThan(240); // default 220 + ~80px drag = ~300, threshold 240
  });

  test('resized label column width persists after reload', async ({ page }) => {
    const handle = page.locator('#gantt-resize-handle');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const saved = await page.evaluate(() => localStorage.getItem('gantt-label-width'));
    expect(Number(saved)).toBeGreaterThan(240); // default 220 + ~60px drag = ~280, threshold 240 gives comfortable margin

    await page.reload();
    await page.waitForSelector('#gantt-labels-hdr'); // consistent with beforeEach sentinel

    const colWidth = await page.locator('#gantt-labels-col').evaluate(
      el => el.getBoundingClientRect().width
    );
    expect(colWidth).toBeGreaterThan(240);
  });
});
