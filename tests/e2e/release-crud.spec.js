/**
 * E2E tests for release and item CRUD operations.
 *
 * Each test starts with a clean localStorage so the app loads DEFAULT_CONFIG:
 *   - 1 release  "リリース1"  (data-ri="0")
 *   - 1 item     "サンプルタスク" (data-ri="0" data-ii="0")
 *
 * DOM structure (abbreviated):
 *   .release-wrap[data-ri]
 *     > .li-head              ← onclick toggles .li-body.open
 *       > .li-name            ← release display name
 *       > .li-sub             ← "startDate 〜 releaseDate"
 *       > button[data-mv-release][data-dir]   ← ↑ / ↓
 *       > button[data-del-release]            ← 削除 (confirm dialog)
 *     > .li-body[.open]
 *       > input[data-rf="name"][data-ri]      ← editable name
 *       > input[data-rf="startDate"][data-ri]
 *       > input[data-rf="releaseDate"][data-ri]
 *       > button[data-add-item-ri]            ← ＋アイテム追加
 *       > .item-wrap[data-ri][data-ii]
 *           > .li-head
 *             > .li-name
 *             > button[data-del-item-ri][data-del-item-ii]  ← 削除 (no confirm)
 *             > button[data-mv-item-ri][data-mv-item-ii][data-dir]
 */

import { test, expect } from '@playwright/test';

const APP = '/wbs-planner.html';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Open (expand) a release accordion by index.
 * Calls toggleLI via JS to avoid clicking a button by mistake.
 */
async function expandRelease(page, rIdx) {
  await page.evaluate((idx) => {
    const wrap = document.querySelector(`.release-wrap[data-ri="${idx}"]`);
    const body = wrap.querySelector(':scope > .li-body');
    if (!body.classList.contains('open')) {
      // toggleLI is a global defined in wbs-planner.html
      toggleLI(wrap.querySelector(':scope > .li-head'));
    }
  }, rIdx);
  // Wait until the body is visible
  await page.locator(`.release-wrap[data-ri="${rIdx}"] > .li-body.open`).waitFor({ state: 'attached' });
}

// ── Test setup ───────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // Navigate to the app
  await page.goto(APP);
  // Clear any persisted config so every test starts from DEFAULT_CONFIG
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // App is ready when the add-release button is present
  await page.waitForSelector('#btn-add-release');
});

// ── リリース CRUD ─────────────────────────────────────────────────────────────

test.describe('リリース CRUD', () => {
  test('初期状態でリリース1が1件表示される', async ({ page }) => {
    await expect(page.locator('.release-wrap')).toHaveCount(1);
    await expect(page.locator('.release-wrap[data-ri="0"] > .li-head > .li-name'))
      .toHaveText('リリース1');
  });

  test('＋リリース追加 でリリースが増える', async ({ page }) => {
    await page.click('#btn-add-release');

    await expect(page.locator('.release-wrap')).toHaveCount(2);
    await expect(page.locator('.release-wrap[data-ri="1"] > .li-head > .li-name'))
      .toHaveText('リリース2');
  });

  test('複数回追加すると件数が正しく増える', async ({ page }) => {
    await page.click('#btn-add-release');
    await page.click('#btn-add-release');

    await expect(page.locator('.release-wrap')).toHaveCount(3);
    await expect(page.locator('.release-wrap[data-ri="2"] > .li-head > .li-name'))
      .toHaveText('リリース3');
  });

  test('リリース名を変更するとヘッダーに即時反映される', async ({ page }) => {
    await expandRelease(page, 0);

    await page.locator('[data-rf="name"][data-ri="0"]').fill('本番リリースv1');

    // The name update is applied directly to the DOM (no full re-render)
    await expect(page.locator('.release-wrap[data-ri="0"] > .li-head > .li-name'))
      .toHaveText('本番リリースv1');
  });

  test('リリースを削除できる（確認ダイアログを承認）', async ({ page }) => {
    await page.click('#btn-add-release');
    await expect(page.locator('.release-wrap')).toHaveCount(2);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-del-release="1"]').click();

    await expect(page.locator('.release-wrap')).toHaveCount(1);
  });

  test('削除ダイアログをキャンセルするとリリースは残る', async ({ page }) => {
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('[data-del-release="0"]').click();

    await expect(page.locator('.release-wrap')).toHaveCount(1);
  });

  test('↓ボタンでリリースの順序を入れ替えられる', async ({ page }) => {
    await page.click('#btn-add-release');
    await expect(page.locator('.release-wrap')).toHaveCount(2);

    // Initial order
    await expect(page.locator('.release-wrap[data-ri="0"] > .li-head > .li-name')).toHaveText('リリース1');
    await expect(page.locator('.release-wrap[data-ri="1"] > .li-head > .li-name')).toHaveText('リリース2');

    // Move first release down
    await page.locator('[data-mv-release="0"][data-dir="1"]').click();

    // After re-render, data-ri attributes are reassigned by position.
    // Check by display order (nth) rather than data-ri.
    const names = page.locator('.release-wrap > .li-head > .li-name');
    await expect(names.nth(0)).toHaveText('リリース2');
    await expect(names.nth(1)).toHaveText('リリース1');
  });

  test('↑ボタンで最上位のリリースは移動できない（disabled）', async ({ page }) => {
    await expect(page.locator('[data-mv-release="0"][data-dir="-1"]')).toBeDisabled();
  });
});

// ── アイテム CRUD ─────────────────────────────────────────────────────────────

test.describe('アイテム CRUD（リリース内）', () => {
  test.beforeEach(async ({ page }) => {
    await expandRelease(page, 0);
  });

  test('初期状態でサンプルタスクが1件表示される', async ({ page }) => {
    await expect(page.locator('.item-wrap')).toHaveCount(1);
    await expect(page.locator('.item-wrap[data-ri="0"][data-ii="0"] > .li-head > .li-name'))
      .toHaveText('サンプルタスク');
  });

  test('＋アイテム追加 で新規アイテムが末尾に追加される', async ({ page }) => {
    await page.locator('[data-add-item-ri="0"]').click();

    await expect(page.locator('.item-wrap')).toHaveCount(2);
    await expect(page.locator('.item-wrap[data-ri="0"][data-ii="1"] > .li-head > .li-name'))
      .toHaveText('新規アイテム');
  });

  test('アイテムを削除できる（確認ダイアログなし）', async ({ page }) => {
    await expect(page.locator('.item-wrap')).toHaveCount(1);

    await page.locator('[data-del-item-ri="0"][data-del-item-ii="0"]').click();

    await expect(page.locator('.item-wrap')).toHaveCount(0);
  });

  test('↑ボタンでアイテムの順序を入れ替えられる', async ({ page }) => {
    // Add a second item
    await page.locator('[data-add-item-ri="0"]').click();
    await expect(page.locator('.item-wrap')).toHaveCount(2);

    // Initial order
    const names = page.locator('.item-wrap > .li-head > .li-name');
    await expect(names.nth(0)).toHaveText('サンプルタスク');
    await expect(names.nth(1)).toHaveText('新規アイテム');

    // Move second item up
    await page.locator('[data-mv-item-ri="0"][data-mv-item-ii="1"][data-dir="-1"]').click();

    await expect(names.nth(0)).toHaveText('新規アイテム');
    await expect(names.nth(1)).toHaveText('サンプルタスク');
  });

  test('↑ボタンで最上位のアイテムは移動できない（disabled）', async ({ page }) => {
    await expect(page.locator('[data-mv-item-ri="0"][data-mv-item-ii="0"][data-dir="-1"]'))
      .toBeDisabled();
  });
});
