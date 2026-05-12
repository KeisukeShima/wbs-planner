# Gantt Chart Collapse Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ガントチャートのラベル行クリックでリリース・アイテム単位に折りたたみ/展開できる機能を追加し、「全折りたたみ」「全展開」ボタンも提供する。

**Architecture:** 折りたたみ状態は `C`（プロジェクトデータ）とは独立した `ganttCollapse` オブジェクトで管理し、localStorage に保存する。`render()` の結果を `lastScheduled` にキャッシュすることで、折りたたみトグル時に再スケジューリングせず `renderGantt()` / `renderTable()` のみを呼び直す。SVG ラベルパネルに透明 `<rect>` をオーバーレイしてクリックを受け取る。

**Tech Stack:** Vanilla JS, SVG, Playwright (E2E tests)

---

## ファイル変更マップ

| ファイル | 変更内容 |
|---------|---------|
| `wbs-planner.html` | 唯一の変更対象。HTML/CSS/JS すべて同ファイルに収録 |
| `tests/e2e/gantt-collapse.spec.js` | 新規 E2E テストファイル |

---

## Task 1: 折りたたみ状態の基盤を追加する

**Files:**
- Modify: `wbs-planner.html` (line 370 付近、`let _undoSnapshot = null;` の直後)

- [ ] **Step 1: `ganttCollapse` 関連の変数・関数を追加する**

`wbs-planner.html` の `let _undoSnapshot = null;`（line 370）の直後に以下を挿入する：

```js
// ── ガントチャート折りたたみ UI ステート ──
function loadCollapseState() {
  try {
    const s = localStorage.getItem('gantt-collapse-state');
    return s ? JSON.parse(s) : { releases: {}, items: {} };
  } catch { return { releases: {}, items: {} }; }
}
function saveCollapseState() {
  try { localStorage.setItem('gantt-collapse-state', JSON.stringify(ganttCollapse)); } catch {}
}
let ganttCollapse = loadCollapseState();
let lastScheduled = null;

function toggleReleaseCollapse(releaseId) {
  if (!lastScheduled) return;
  if (ganttCollapse.releases[releaseId]) {
    delete ganttCollapse.releases[releaseId];
  } else {
    ganttCollapse.releases[releaseId] = true;
  }
  saveCollapseState();
  renderGantt(lastScheduled);
  renderTable(lastScheduled);
}

function toggleItemCollapse(releaseId, itemIdx) {
  if (!lastScheduled) return;
  const key = `${releaseId}_${itemIdx}`;
  if (ganttCollapse.items[key]) {
    delete ganttCollapse.items[key];
  } else {
    ganttCollapse.items[key] = true;
  }
  saveCollapseState();
  renderGantt(lastScheduled);
  renderTable(lastScheduled);
}
```

- [ ] **Step 2: ブラウザで動作確認（エラーが出ないこと）**

```bash
python3 -m http.server 8787
```

`http://localhost:8787/wbs-planner.html` を開き、コンソールにエラーが出ないことを確認。

- [ ] **Step 3: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: add gantt collapse state infrastructure"
```

---

## Task 2: `lastScheduled` キャッシュとボタン追加

**Files:**
- Modify: `wbs-planner.html` (line 278 の HTML、line 1025 付近の `render()`、イベントハンドラ追加)

- [ ] **Step 1: HTML の card-header を変更する**

`wbs-planner.html` line 278 を：
```html
      <div class="card-header">ガントチャート</div>
```
以下に置き換える：
```html
      <div class="card-header" style="display:flex;align-items:center;">ガントチャート<div style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-secondary btn-sm" id="btn-collapse-all">▶ 全折りたたみ</button><button class="btn btn-secondary btn-sm" id="btn-expand-all">▼ 全展開</button></div></div>
```

- [ ] **Step 2: `render()` に `lastScheduled` キャッシュを追加する**

`render()` 内（line 1025 付近）の：
```js
  renderGantt(scheduled);
  renderTable(scheduled);
}
```
を以下に置き換える：
```js
  lastScheduled = scheduled;
  renderGantt(scheduled);
  renderTable(scheduled);
}
```

- [ ] **Step 3: 全折りたたみ・全展開ボタンのイベントハンドラを追加する**

`document.getElementById('btn-reset').addEventListener` の前（line 1075 付近）に追加する：

```js
document.getElementById('btn-collapse-all').addEventListener('click', () => {
  if (!lastScheduled) return;
  C.releases.forEach(r => { ganttCollapse.releases[r.id] = true; });
  ganttCollapse.items = {};
  saveCollapseState();
  renderGantt(lastScheduled);
  renderTable(lastScheduled);
});
document.getElementById('btn-expand-all').addEventListener('click', () => {
  ganttCollapse = { releases: {}, items: {} };
  saveCollapseState();
  renderGantt(lastScheduled);
  renderTable(lastScheduled);
});
```

- [ ] **Step 4: ブラウザでボタンが表示されることを確認**

`http://localhost:8787/wbs-planner.html` を開き、ガントチャートの右上に「▶ 全折りたたみ」「▼ 全展開」ボタンが表示されること（まだクリックしても変化しなくてよい）。

- [ ] **Step 5: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: add collapse-all/expand-all buttons and lastScheduled cache"
```

---

## Task 3: 失敗する E2E テストを書く

**Files:**
- Create: `tests/e2e/gantt-collapse.spec.js`

- [ ] **Step 1: テストファイルを作成する**

```js
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
```

- [ ] **Step 2: テストを実行して全件 FAIL を確認**

```bash
npx playwright test tests/e2e/gantt-collapse.spec.js
```

期待出力: 全テストが失敗（`data-visible-row-count` 属性や `[data-collapse-release]` が存在しないため）

- [ ] **Step 3: コミット（失敗テストをコミット）**

```bash
git add tests/e2e/gantt-collapse.spec.js
git commit -m "test: add failing E2E tests for gantt collapse feature"
```

---

## Task 4: `renderGantt()` に `visibleRows` フィルタリングを実装する

**Files:**
- Modify: `wbs-planner.html` (line 772〜784 付近)

- [ ] **Step 1: `visibleRows` 構築コードを追加する**

`renderGantt()` 内の `rows[i].rowCount = j - i;` の閉じブロック（`}`）直後（line 780 付近）に以下を挿入する：

```js
  // ── 折りたたみ状態に基づいて表示行をフィルタリング ──
  const visibleRows = [];
  for (const row of rows) {
    if (row.kind === 'release') {
      visibleRows.push(row);
    } else if (row.kind === 'hdr') {
      const releaseId = C.releases[row.rIdx]?.id;
      if (ganttCollapse.releases[releaseId]) continue;
      visibleRows.push(row);
    } else {
      const releaseId = C.releases[row.task.releaseIdx]?.id;
      if (ganttCollapse.releases[releaseId]) continue;
      if (ganttCollapse.items[`${releaseId}_${row.task.itemIdx}`]) continue;
      visibleRows.push(row);
    }
  }

  // eval zone 用に visibleRowCount を各リリース行に設定
  for (let i = 0; i < visibleRows.length; i++) {
    if (visibleRows[i].kind === 'release') {
      let j = i + 1;
      while (j < visibleRows.length && visibleRows[j].kind !== 'release') j++;
      visibleRows[i].visibleRowCount = j - i;
    }
  }
```

- [ ] **Step 2: `bodyH` / `totalH` を `visibleRows` ベースに変更する**

現在（line 781〜784 付近）:
```js
  const chartW  = dateToX(vEnd, vStart, unit);
  const totalW  = LW + chartW;
  const bodyH   = rows.length * ROW_H + PAD;
  const totalH  = HDR_H + bodyH;
```
以下に変更:
```js
  const chartW  = dateToX(vEnd, vStart, unit);
  const totalW  = LW + chartW;
  const bodyH   = visibleRows.length * ROW_H + PAD;
  const totalH  = HDR_H + bodyH;
```

- [ ] **Step 3: eval zone の描画を `visibleRows` に切り替える**

eval zone 描画ブロック（line 810 付近）:
```js
  rows.forEach((row, ri) => {
    if (row.kind !== 'release') return;
    const m = row.meta;
    if (!m.showEvalZone) return;
    const zoneY    = HDR_H + ri * ROW_H;
    const zoneH    = row.rowCount * ROW_H;
```
以下に変更:
```js
  visibleRows.forEach((row, ri) => {
    if (row.kind !== 'release') return;
    const m = row.meta;
    if (!m.showEvalZone) return;
    const zoneY    = HDR_H + ri * ROW_H;
    const zoneH    = row.visibleRowCount * ROW_H;
```

- [ ] **Step 4: メイン行レンダリングループを `visibleRows` に切り替える**

行レンダリングブロック（line 863〜921 付近）:
```js
  const RELEASE_ROW_H = ROW_H;
  rows.forEach((row, ri) => {
```
以下に変更:
```js
  const RELEASE_ROW_H = ROW_H;
  visibleRows.forEach((row, ri) => {
```

- [ ] **Step 5: `svgL` に `data-visible-row-count` 属性を追加する**

`renderGantt()` の末尾付近、`svgL.innerHTML = gL;` の直後（line 938 付近）に追加:
```js
  svgL.setAttribute('data-visible-row-count', visibleRows.length);
```

- [ ] **Step 6: ブラウザで動作確認（表示が崩れないこと）**

`http://localhost:8787/wbs-planner.html` で通常表示が崩れていないことを確認。

- [ ] **Step 7: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: filter gantt rows by collapse state using visibleRows"
```

---

## Task 5: `renderGantt()` にインタラクティブ要素を実装する

**Files:**
- Modify: `wbs-planner.html` (line 867〜894 付近のリリース行・hdr行レンダリング)

- [ ] **Step 1: リリース行にトグルアイコン・クリック領域を追加する**

リリース行レンダリングブロック（line 867〜883 付近）を以下に置き換える：

変更前:
```js
    if (row.kind === 'release') {
      // リリース見出し行 — ラベルパネル
      const color = row.meta.color || '#6D28D9';
      gL += `<rect x="0" y="${ry}" width="${LW}" height="${RELEASE_ROW_H}" fill="${color}" opacity=".18"/>`;
      gL += `<text x="8" y="${ry+RELEASE_ROW_H/2+4}" fill="${color}" font-size="11" font-weight="700" font-family="sans-serif">▼ ${esc(trunc(row.meta.name, 18))}</text>`;
      gL += `<line x1="0" y1="${ry}" x2="${LW}" y2="${ry}" stroke="${color}" stroke-width=".8" opacity=".4"/>`;
```

変更後:
```js
    if (row.kind === 'release') {
      // リリース見出し行 — ラベルパネル
      const color = row.meta.color || '#6D28D9';
      const releaseId = row.meta.id;
      const isRelCollapsed = !!ganttCollapse.releases[releaseId];
      const relIcon = isRelCollapsed ? '▶' : '▼';
      const itemCount = C.releases[row.rIdx]?.items?.length ?? 0;
      const relSuffix = isRelCollapsed ? ` (${itemCount}アイテム)` : '';
      gL += `<rect x="0" y="${ry}" width="${LW}" height="${RELEASE_ROW_H}" fill="${color}" opacity=".18"/>`;
      gL += `<text x="8" y="${ry+RELEASE_ROW_H/2+4}" fill="${color}" font-size="11" font-weight="700" font-family="sans-serif">${relIcon} ${esc(trunc(row.meta.name, 15))}${relSuffix}</text>`;
      gL += `<line x1="0" y1="${ry}" x2="${LW}" y2="${ry}" stroke="${color}" stroke-width=".8" opacity=".4"/>`;
      gL += `<rect x="0" y="${ry}" width="${LW}" height="${RELEASE_ROW_H}" fill="transparent" style="cursor:pointer" data-collapse-release="${releaseId}" onclick="toggleReleaseCollapse('${releaseId}')"/>`;
```

- [ ] **Step 2: アイテム hdr 行にトグルアイコン・クリック領域・サマリーバーを追加する**

アイテム hdr 行レンダリングブロック（line 885〜894 付近）を以下に置き換える：

変更前:
```js
    } else if (row.kind === 'hdr') {
      // アイテム見出し行 — ラベルパネル
      if (ri % 2 === 0) gL += `<rect x="0" y="${ry}" width="${LW}" height="${ROW_H}" fill="#FAFAFA"/>`;
      gL += `<text x="16" y="${ry+ROW_H/2+4}" fill="#374151" font-size="10" font-weight="700" font-family="sans-serif">${row.iIdx+1} ${esc(trunc(row.item.name, 20))}</text>`;
      if (row.item.category) {
        gL += `<rect x="${LW-75}" y="${ry+6}" width="70" height="16" rx="8" fill="#F3F4F6"/>`;
        gL += `<text x="${LW-40}" y="${ry+17}" text-anchor="middle" fill="#6B7280" font-size="9" font-family="sans-serif">${esc(trunc(row.item.category, 10))}</text>`;
      }
      gL += `<line x1="0" y1="${ry}" x2="${LW}" y2="${ry}" stroke="#E5E7EB" stroke-width=".8"/>`;
      g  += `<line x1="0" y1="${ry}" x2="${chartW}" y2="${ry}" stroke="#E5E7EB" stroke-width=".8"/>`;
```

変更後:
```js
    } else if (row.kind === 'hdr') {
      // アイテム見出し行 — ラベルパネル
      const releaseId = C.releases[row.rIdx]?.id;
      const collapseItemKey = `${releaseId}_${row.iIdx}`;
      const isItemCollapsed = !!ganttCollapse.items[collapseItemKey];
      const itemIcon = isItemCollapsed ? '▶' : '▼';
      if (ri % 2 === 0) gL += `<rect x="0" y="${ry}" width="${LW}" height="${ROW_H}" fill="#FAFAFA"/>`;
      gL += `<text x="8" y="${ry+ROW_H/2+4}" fill="#374151" font-size="10" font-weight="700" font-family="sans-serif">${itemIcon} ${row.iIdx+1} ${esc(trunc(row.item.name, 16))}</text>`;
      if (row.item.category && !isItemCollapsed) {
        gL += `<rect x="${LW-75}" y="${ry+6}" width="70" height="16" rx="8" fill="#F3F4F6"/>`;
        gL += `<text x="${LW-40}" y="${ry+17}" text-anchor="middle" fill="#6B7280" font-size="9" font-family="sans-serif">${esc(trunc(row.item.category, 10))}</text>`;
      }
      gL += `<line x1="0" y1="${ry}" x2="${LW}" y2="${ry}" stroke="#E5E7EB" stroke-width=".8"/>`;
      g  += `<line x1="0" y1="${ry}" x2="${chartW}" y2="${ry}" stroke="#E5E7EB" stroke-width=".8"/>`;
      if (isItemCollapsed) {
        const itemTasks = tasks.filter(t => t.releaseIdx === row.rIdx && t.itemIdx === row.iIdx && t.startDate && t.endDate);
        if (itemTasks.length) {
          const minStart = new Date(Math.min(...itemTasks.map(t => t.startDate.getTime())));
          const maxEnd   = new Date(Math.max(...itemTasks.map(t => t.endDate.getTime())));
          const bx = dateToX(minStart, vStart, unit);
          const ex = dateToX(addDays(maxEnd, 1), vStart, unit);
          const by = ry + 4, bh = ROW_H - 8;
          g += `<rect x="${bx}" y="${by}" width="${Math.max(ex - bx, 3)}" height="${bh}" rx="3" fill="#9CA3AF" opacity=".35"/>`;
        }
      }
      gL += `<rect x="0" y="${ry}" width="${LW}" height="${ROW_H}" fill="transparent" style="cursor:pointer" data-collapse-item="${collapseItemKey}" onclick="toggleItemCollapse('${releaseId}', ${row.iIdx})"/>`;
```

- [ ] **Step 3: ブラウザで折りたたみ動作を手動確認**

`http://localhost:8787/wbs-planner.html` を開き：
1. リリース行をクリック → 配下が消えてアイコンが `▶` に変わること
2. 再クリック → 展開されてアイコンが `▼` に戻ること
3. アイテム行をクリック → 工程のみ消えてサマリーバーが表示されること
4. 「全折りたたみ」「全展開」ボタンが動作すること

- [ ] **Step 4: E2E テストを実行して「初期状態」テストのみ PASS を確認**

```bash
npx playwright test tests/e2e/gantt-collapse.spec.js
```

期待出力: 1/8 PASS（`data-visible-row-count='4'` を確認する「初期状態」テストのみ通過。クリック対象の `[data-collapse-release]` / `[data-collapse-item]` は Task 5 で追加するため残りは失敗）

- [ ] **Step 5: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: add collapse toggle icons and click targets to gantt labels"
```

---

## Task 6: `renderTable()` に折りたたみ連動フィルタリングを実装する

**Files:**
- Modify: `wbs-planner.html` (line 957〜988 付近の `renderTable()`)

- [ ] **Step 1: `renderTable()` に collapse チェックを追加する**

`renderTable()` 内の `tasks.forEach(t => {` ブロックを以下に置き換える：

変更前:
```js
  tasks.forEach(t => {
    // リリース見出し行
    if (t.releaseIdx !== prevReleaseIdx) {
      const m     = releaseMeta[t.releaseIdx];
      const color = m.color || '#6D28D9';
      h += `<tr style="background:${color}1a"><td colspan="5" style="font-weight:700;color:${color};font-size:.82rem;padding:7px 13px">▼ ${esc(m.name)} &nbsp;<span style="font-weight:400;font-size:.75rem">${m.startDate} 〜 ${m.releaseDate}</span></td></tr>`;
      prevReleaseIdx = t.releaseIdx;
      prevItemKey    = null;
    }
    // アイテム見出し行
    const itemKey = `${t.releaseIdx}-${t.itemIdx}`;
    if (itemKey !== prevItemKey) {
      h += `<tr class="irow"><td colspan="5" style="padding-left:22px">${t.itemIdx+1} ${esc(t.itemName)}${t.category ? `<span class="badge" style="background:#F3F4F6;color:#6B7280;margin-left:8px">${esc(t.category)}</span>` : ''}</td></tr>`;
      prevItemKey = itemKey;
    }
    const biz = (t.startDate && t.endDate) ? countBiz(t.startDate, t.endDate, hols) : '—';
    h += `<tr>
      <td style="padding-left:36px">${esc(t.wbsNo)} ${esc(t.phaseType)}${t.isBackground ? ' <em style="color:#9CA3AF;font-size:.8em">(BG)</em>' : ''}</td>
      <td>${esc(t.assignedPeople.join(', ') || '未割当')}</td>
      <td>${t.startDate ? fmtJP(t.startDate) : '—'}</td>
      <td>${t.endDate   ? fmtJP(t.endDate)   : '—'}</td>
      <td>${biz}</td>
    </tr>`;
  });
```

変更後:
```js
  tasks.forEach(t => {
    const releaseId = C.releases[t.releaseIdx]?.id;

    // リリース見出し行（折りたたみ中でも表示）
    if (t.releaseIdx !== prevReleaseIdx) {
      const m     = releaseMeta[t.releaseIdx];
      const color = m.color || '#6D28D9';
      h += `<tr style="background:${color}1a"><td colspan="5" style="font-weight:700;color:${color};font-size:.82rem;padding:7px 13px">▼ ${esc(m.name)} &nbsp;<span style="font-weight:400;font-size:.75rem">${m.startDate} 〜 ${m.releaseDate}</span></td></tr>`;
      prevReleaseIdx = t.releaseIdx;
      prevItemKey    = null;
    }

    // リリースが折りたたまれていたらアイテム・タスク行をスキップ
    if (ganttCollapse.releases[releaseId]) return;

    // アイテム見出し行
    const itemKey = `${t.releaseIdx}-${t.itemIdx}`;
    if (itemKey !== prevItemKey) {
      h += `<tr class="irow"><td colspan="5" style="padding-left:22px">${t.itemIdx+1} ${esc(t.itemName)}${t.category ? `<span class="badge" style="background:#F3F4F6;color:#6B7280;margin-left:8px">${esc(t.category)}</span>` : ''}</td></tr>`;
      prevItemKey = itemKey;
    }

    // アイテムが折りたたまれていたらタスク行をスキップ
    const collapseItemKey = `${releaseId}_${t.itemIdx}`;
    if (ganttCollapse.items[collapseItemKey]) return;

    const biz = (t.startDate && t.endDate) ? countBiz(t.startDate, t.endDate, hols) : '—';
    h += `<tr>
      <td style="padding-left:36px">${esc(t.wbsNo)} ${esc(t.phaseType)}${t.isBackground ? ' <em style="color:#9CA3AF;font-size:.8em">(BG)</em>' : ''}</td>
      <td>${esc(t.assignedPeople.join(', ') || '未割当')}</td>
      <td>${t.startDate ? fmtJP(t.startDate) : '—'}</td>
      <td>${t.endDate   ? fmtJP(t.endDate)   : '—'}</td>
      <td>${biz}</td>
    </tr>`;
  });
```

- [ ] **Step 2: ブラウザでテーブル連動を確認**

`http://localhost:8787/wbs-planner.html` を開き、リリース行を折りたたむとサマリーテーブルのアイテム・工程行も消えることを確認。

- [ ] **Step 3: 全 E2E テストを実行して全件 PASS を確認**

```bash
npx playwright test tests/e2e/gantt-collapse.spec.js
```

期待出力: 8/8 件 PASS

- [ ] **Step 4: 既存テストがリグレッションしていないことを確認**

```bash
npx playwright test
```

期待出力: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: sync table with gantt collapse state"
```

---

## Task 7: 最終確認とスペックセルフレビュー

- [ ] **Step 1: 全テストを再実行して最終確認**

```bash
npx playwright test
```

期待出力: 全テスト PASS

- [ ] **Step 2: ブラウザで動作確認チェックリスト**

`http://localhost:8787/wbs-planner.html` を開いて以下を確認：

1. リリース行クリック → 配下の行が消え `▶` アイコン + `(Nアイテム)` が表示される
2. 再クリック → 展開され `▼` アイコンになる
3. アイテム行クリック → 工程行が消えチャートにグレーサマリーバーが表示される
4. 再クリック → 展開される
5. 「▶ 全折りたたみ」 → 全リリースが折りたたまれる
6. 「▼ 全展開」 → 全行が展開される
7. リロード後に折りたたみ状態が復元される
8. サマリーテーブルが連動して折りたたまれる

- [ ] **Step 3: superpowers:finishing-a-development-branch スキルを起動してブランチ統合を検討する**
