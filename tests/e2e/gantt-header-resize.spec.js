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
    // The layout uses #preview (overflow:auto) as the scroll container — not window.
    // Default data (1 task) produces a chart shorter than the 720px viewport, so
    // scrolling is impossible.  Populate localStorage with many items first so the
    // Gantt chart overflows #preview and the sticky behaviour can be exercised.
    await page.evaluate(() => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: `item_${i}`,
        name: `タスク${i + 1}`,
        category: '開発',
        note: '',
        phases: [
          { type: '要件定義', days: 5 },
          { type: '設計開発', days: 10 },
        ],
      }));
      const cfg = {
        projectName: 'Test',
        startDate: '2026-04-20',
        ganttUnit: 'weeks',
        holidays: { national: [], company: [] },
        phaseTypes: [
          { name: '要件定義',  team: 'D&T', color: '#3B82F6' },
          { name: '設計開発',  team: 'SI',  color: '#10B981' },
        ],
        people: [],
        releases: [{
          id: 'r_default',
          name: 'リリース1',
          color: '#6D28D9',
          startDate: '2026-04-20',
          releaseDate: '2026-09-30',
          evalPeriod: { value: 4, unit: 'weeks' },
          showEvalZone: false,
          evalZone: { label: 'リリース評価', color: '#8B5CF6' },
          epicKey: '',
          items,
        }],
      };
      localStorage.setItem('gantt-gen-cfg', JSON.stringify(cfg));
    });
    await page.reload();
    await page.waitForSelector('#gantt-card');

    // Verify #preview is now scrollable
    const scrollable = await page.evaluate(() => {
      const p = document.getElementById('preview');
      return p.scrollHeight > p.clientHeight;
    });
    expect(scrollable).toBe(true);

    // Find offset of date header within #preview's coordinate space
    const naturalTop = await page.evaluate(() => {
      const preview = document.getElementById('preview');
      const hdr = document.querySelector('.gantt-date-hdr');
      const previewRect = preview.getBoundingClientRect();
      const hdrRect = hdr.getBoundingClientRect();
      return (hdrRect.top - previewRect.top) + preview.scrollTop;
    });

    // Scroll #preview so the header's natural position is above the visible area
    await page.evaluate(y => {
      document.getElementById('preview').scrollTop = y + 50;
    }, naturalTop);
    // Wait for one paint frame so CSS sticky has taken effect
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    // Guard: verify the scroll container actually scrolled
    expect(await page.evaluate(() => document.getElementById('preview').scrollTop)).toBeGreaterThan(0);

    const rect = await page.locator('.gantt-date-hdr').evaluate(
      el => el.getBoundingClientRect()
    );
    // The sticky element uses top:-24px (= negative of #preview padding-top) so it sticks
    // at the very top of #preview's border box (y=0 of the viewport), not at the content edge.
    const previewTop = await page.evaluate(() =>
      document.getElementById('preview').getBoundingClientRect().top
    );
    // Sticky: hdr top should be ≈ previewTop (within a few pixels)
    expect(rect.top).toBeGreaterThanOrEqual(previewTop - 1);
    expect(rect.top).toBeLessThan(previewTop + 5);
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
