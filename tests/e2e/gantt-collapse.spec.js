// tests/e2e/gantt-collapse.spec.js
import { test, expect } from '@playwright/test';

const APP = '/wbs-planner.html';

// デフォルト設定: 1 リリース (id="r_default"), 1 アイテム "サンプルタスク", 2 工程 (要件定義, 設計開発)
// visibleRows = 4: release(1) + hdr(1) + task(2)

test.beforeEach(async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#btn-add-release');
  // ガントが描画されるまで待つ
  await page.waitForFunction(() => {
    const svg = document.getElementById('gantt-labels');
    return svg && svg.getAttribute('data-visible-row-count') !== null;
  });
});

test.describe('ガントチャート折りたたみ', () => {

  test('初期状態で全行が表示される (4行)', async ({ page }) => {
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '4');
  });

  test('リリース行クリックで配下の行が非表示になる (1行のみ残る)', async ({ page }) => {
    await page.locator('[data-collapse-release]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
  });

  test('折りたたんだリリース行を再クリックすると展開される', async ({ page }) => {
    await page.locator('[data-collapse-release]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
    await page.locator('[data-collapse-release]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '4');
  });

  test('アイテム行クリックで工程行だけが非表示になる (2行残る)', async ({ page }) => {
    await page.locator('[data-collapse-item]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '2');
  });

  test('折りたたんだアイテム行を再クリックすると展開される', async ({ page }) => {
    await page.locator('[data-collapse-item]').first().click();
    await page.locator('[data-collapse-item]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '4');
  });

  test('「全折りたたみ」ボタンで全リリースが折りたたまれる', async ({ page }) => {
    await page.click('#btn-collapse-all');
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
  });

  test('「全展開」ボタンで全行が展開される', async ({ page }) => {
    // まず折りたたむ
    await page.click('#btn-collapse-all');
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
    // 展開
    await page.click('#btn-expand-all');
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '4');
  });

  test('折りたたみ状態がリロード後も保持される', async ({ page }) => {
    await page.locator('[data-collapse-release]').first().click();
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
    await page.reload();
    await page.waitForFunction(() => {
      const svg = document.getElementById('gantt-labels');
      return svg && svg.getAttribute('data-visible-row-count') !== null;
    });
    await expect(page.locator('#gantt-labels'))
      .toHaveAttribute('data-visible-row-count', '1');
  });

});
