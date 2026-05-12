# Gantt Sticky Header & Label Column Resize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky date header (stays visible on vertical page scroll) and a drag-to-resize label column to the Gantt chart, with width persisted in localStorage.

**Architecture:** The existing two SVGs (`gantt-labels`, `gantt`) are replaced with four: a header/body split for each side. The same SVG content strings are reused with different `viewBox` values to clip header vs body areas. A drag handle sits between the label column and chart area; on drag-end `LW` is updated and `renderGantt(lastScheduled)` is called. Scroll sync is handled by a `marginLeft` offset on the date-header SVG triggered by the chart-scroll listener.

**Tech Stack:** Vanilla JS, SVG, CSS `position: sticky`, Playwright (E2E tests), Python 3 HTTP server for test serving.

---

## Files

| File | Change |
|---|---|
| `wbs-planner.html` | All changes — CSS, HTML structure, JS |
| `tests/e2e/gantt-header-resize.spec.js` | New E2E test file |

---

### Task 1: Write failing E2E tests

**Files:**
- Create: `tests/e2e/gantt-header-resize.spec.js`

- [ ] **Step 1: Create the test file**

```javascript
import { test, expect } from '@playwright/test';

const APP = '/wbs-planner.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Wait for the new SVG IDs that Task 3 will create
  await page.waitForSelector('#gantt-labels-hdr', { timeout: 5000 });
});

test('date header sticks to top when page scrolls past it', async ({ page }) => {
  // Find natural document-offset of the date header
  const naturalTop = await page.locator('.gantt-date-hdr').evaluate(
    el => el.getBoundingClientRect().top + window.scrollY
  );
  // Scroll so its natural position is above the viewport
  await page.evaluate(y => window.scrollTo(0, y + 50), naturalTop);
  await page.waitForTimeout(100);

  const rect = await page.locator('.gantt-date-hdr').evaluate(
    el => el.getBoundingClientRect()
  );
  // Sticky: actual top should be ≈0, not negative
  expect(rect.top).toBeGreaterThanOrEqual(-1);
  expect(rect.top).toBeLessThan(5);
});

test('drag resize handle changes label column width', async ({ page }) => {
  const handle = page.locator('#gantt-resize-handle');
  const box = await handle.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const colWidth = await page.locator('#gantt-labels-col').evaluate(
    el => el.getBoundingClientRect().width
  );
  expect(colWidth).toBeGreaterThan(240); // default 220 + drag ~80
});

test('resized label column width persists after reload', async ({ page }) => {
  const handle = page.locator('#gantt-resize-handle');
  const box = await handle.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const saved = await page.evaluate(() => localStorage.getItem('gantt-label-width'));
  expect(Number(saved)).toBeGreaterThan(240);

  await page.reload();
  await page.waitForSelector('#gantt-labels-col');

  const colWidth = await page.locator('#gantt-labels-col').evaluate(
    el => el.getBoundingClientRect().width
  );
  expect(colWidth).toBeGreaterThan(240);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx playwright test tests/e2e/gantt-header-resize.spec.js
```

Expected: all 3 tests FAIL (selectors `#gantt-labels-hdr`, `.gantt-date-hdr`, `#gantt-resize-handle`, `#gantt-labels-col` do not exist yet).

---

### Task 2: Update CSS and HTML structure

**Files:**
- Modify: `wbs-planner.html:73-75` (CSS) and `wbs-planner.html:279-281` (HTML)

- [ ] **Step 1: Replace the three CSS rules (lines 73–75)**

Find and replace this block:
```css
.chart-container{display:flex;overflow:hidden;align-items:flex-start}
#gantt-labels{flex-shrink:0;display:block;box-shadow:2px 0 6px rgba(0,0,0,.08);z-index:1}
.chart-scroll{overflow-x:auto;flex:1}
```

With:
```css
.chart-outer{display:flex;align-items:flex-start}
.gantt-labels-col{flex-shrink:0}
.gantt-labels-hdr-wrap{position:sticky;top:0;z-index:10;background:#fff}
.gantt-right{flex:1;overflow:hidden}
.gantt-date-hdr{position:sticky;top:0;z-index:10;overflow:hidden;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.06)}
#gantt-resize-handle{width:6px;flex-shrink:0;cursor:col-resize;background:#E5E7EB;align-self:stretch}
#gantt-resize-handle:hover{background:#BFDBFE}
.chart-scroll{overflow-x:auto}
```

- [ ] **Step 2: Replace the HTML chart container (around line 279–281)**

Find:
```html
      <div class="chart-container">
        <svg id="gantt-labels"></svg>
        <div class="chart-scroll"><svg id="gantt"></svg></div>
      </div>
```

Replace with:
```html
      <div class="chart-outer">
        <div class="gantt-labels-col" id="gantt-labels-col">
          <div class="gantt-labels-hdr-wrap"><svg id="gantt-labels-hdr"></svg></div>
          <svg id="gantt-labels-body"></svg>
        </div>
        <div id="gantt-resize-handle"></div>
        <div class="gantt-right">
          <div class="gantt-date-hdr"><svg id="gantt-hdr"></svg></div>
          <div class="chart-scroll"><svg id="gantt-body"></svg></div>
        </div>
      </div>
```

- [ ] **Step 3: Verify the page loads without JS errors**

Open `http://localhost:8787/wbs-planner.html` in a browser (run `python3 -m http.server 8787` first if not running). Open DevTools → Console. Confirm no errors, chart area is blank (SVGs are empty — JS not updated yet). The new layout structure (drag handle visible as grey bar) should be present.

- [ ] **Step 4: Commit**

```bash
git add wbs-planner.html
git commit -m "refactor: replace chart-container with 4-SVG sticky layout structure"
```

---

### Task 3: Update JS — LW variable, renderGantt SVG targets, clear functions

**Files:**
- Modify: `wbs-planner.html:742` (LW), `wbs-planner.html:777-781` (early return in renderGantt), `wbs-planner.html:1023-1034` (SVG rendering), `wbs-planner.html:1106-1108` (clear in render())

- [ ] **Step 1: Change `const LW` to a `let` with localStorage init (around line 742)**

Find:
```javascript
const LW=220, ROW_H=30, HDR_H=48, PAD=8;
```

Replace with:
```javascript
let LW = (() => {
  const s = localStorage.getItem('gantt-label-width');
  return s ? Math.max(120, Math.min(400, +s)) : 220;
})();
const ROW_H=30, HDR_H=48, PAD=8;
```

- [ ] **Step 2: Fix the early return in `renderGantt` (around line 777)**

Find:
```javascript
  if (!tasks.length || !releaseMeta.length) {
    document.getElementById('gantt-labels').innerHTML = '';
    document.getElementById('gantt').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    return;
  }
```

Replace with:
```javascript
  if (!tasks.length || !releaseMeta.length) {
    ['gantt-labels-hdr','gantt-labels-body','gantt-hdr','gantt-body'].forEach(
      id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
    );
    document.getElementById('legend').innerHTML = '';
    return;
  }
```

- [ ] **Step 3: Replace the SVG-rendering block at end of `renderGantt` (around line 1023)**

Find:
```javascript
  const svgL = document.getElementById('gantt-labels');
  svgL.setAttribute('width',   LW);
  svgL.setAttribute('height',  Math.ceil(totalH));
  svgL.setAttribute('viewBox', `0 0 ${LW} ${Math.ceil(totalH)}`);
  svgL.innerHTML = gL;
  svgL.setAttribute('data-visible-row-count', visibleRows.length);

  const svg = document.getElementById('gantt');
  svg.setAttribute('width',   Math.ceil(chartW));
  svg.setAttribute('height',  Math.ceil(totalH));
  svg.setAttribute('viewBox', `0 0 ${Math.ceil(chartW)} ${Math.ceil(totalH)}`);
  svg.innerHTML = g;
```

Replace with:
```javascript
  const svgLabelsHdr = document.getElementById('gantt-labels-hdr');
  svgLabelsHdr.setAttribute('width',   LW);
  svgLabelsHdr.setAttribute('height',  HDR_H);
  svgLabelsHdr.setAttribute('viewBox', `0 0 ${LW} ${HDR_H}`);
  svgLabelsHdr.innerHTML = gL;

  const svgLabelsBody = document.getElementById('gantt-labels-body');
  svgLabelsBody.setAttribute('width',   LW);
  svgLabelsBody.setAttribute('height',  Math.ceil(bodyH));
  svgLabelsBody.setAttribute('viewBox', `0 ${HDR_H} ${LW} ${Math.ceil(bodyH)}`);
  svgLabelsBody.innerHTML = gL;
  svgLabelsBody.setAttribute('data-visible-row-count', visibleRows.length);

  const svgHdr = document.getElementById('gantt-hdr');
  svgHdr.setAttribute('width',   Math.ceil(chartW));
  svgHdr.setAttribute('height',  HDR_H);
  svgHdr.setAttribute('viewBox', `0 0 ${Math.ceil(chartW)} ${HDR_H}`);
  svgHdr.innerHTML = g;

  const svgBody = document.getElementById('gantt-body');
  svgBody.setAttribute('width',   Math.ceil(chartW));
  svgBody.setAttribute('height',  Math.ceil(bodyH));
  svgBody.setAttribute('viewBox', `0 ${HDR_H} ${Math.ceil(chartW)} ${Math.ceil(bodyH)}`);
  svgBody.innerHTML = g;

  document.getElementById('gantt-labels-col').style.width = `${LW}px`;
  initGanttScrollSync();
```

- [ ] **Step 4: Fix the clear block inside `render()` (around line 1106)**

Find:
```javascript
    lastScheduled = null;
    document.getElementById('gantt-labels').innerHTML = '';
    document.getElementById('gantt').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
```

Replace with:
```javascript
    lastScheduled = null;
    ['gantt-labels-hdr','gantt-labels-body','gantt-hdr','gantt-body','legend'].forEach(
      id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
    );
```

- [ ] **Step 5: Verify the chart renders in the browser**

Open `http://localhost:8787/wbs-planner.html`. The Gantt chart should render correctly with all rows visible. Open DevTools → Console — no errors. Resize the browser window; chart should adapt.

- [ ] **Step 6: Commit**

```bash
git add wbs-planner.html
git commit -m "feat: split gantt SVGs into header/body with viewBox and restore LW from localStorage"
```

---

### Task 4: Add `initGanttScrollSync`

**Files:**
- Modify: `wbs-planner.html` — add function after `renderGantt` closes (before `// TABLE RENDERER` comment)

- [ ] **Step 1: Add the function**

Find the line `// ═══════════════════════════════════════════════════════════` that precedes `//  TABLE RENDERER`. Insert the following **before** it:

```javascript
function initGanttScrollSync() {
  const chartScroll = document.querySelector('.chart-scroll');
  const dateHdrSvg  = document.getElementById('gantt-hdr');
  if (!chartScroll || !dateHdrSvg) return;
  if (chartScroll._scrollHandler) {
    chartScroll.removeEventListener('scroll', chartScroll._scrollHandler);
  }
  chartScroll._scrollHandler = () => {
    dateHdrSvg.style.marginLeft = `-${chartScroll.scrollLeft}px`;
  };
  chartScroll.addEventListener('scroll', chartScroll._scrollHandler, { passive: true });
}
```

- [ ] **Step 2: Verify horizontal scroll sync in browser**

Set gantt unit to "日" (days) so the chart is wide enough to scroll horizontally. Scroll the chart right — the date header should scroll in sync. DevTools Console: no errors.

- [ ] **Step 3: Commit**

```bash
git add wbs-planner.html
git commit -m "feat: add initGanttScrollSync to mirror chart horizontal scroll to date header"
```

---

### Task 5: Add `initGanttResize` and call at page load

**Files:**
- Modify: `wbs-planner.html` — add function, add call in init section

- [ ] **Step 1: Add the function after `initGanttScrollSync`**

```javascript
function initGanttResize() {
  const handle    = document.getElementById('gantt-resize-handle');
  const labelsCol = document.getElementById('gantt-labels-col');
  if (!handle || !labelsCol) return;
  let startX, startLW;

  handle.addEventListener('mousedown', e => {
    startX  = e.clientX;
    startLW = LW;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    e.preventDefault();
  });

  function onMove(e) {
    const w = Math.max(120, Math.min(400, startLW + e.clientX - startX));
    labelsCol.style.width = `${w}px`;
  }

  function onUp(e) {
    LW = Math.max(120, Math.min(400, startLW + e.clientX - startX));
    localStorage.setItem('gantt-label-width', LW);
    if (lastScheduled) renderGantt(lastScheduled);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }
}
```

- [ ] **Step 2: Call `initGanttResize()` at page load**

Find the very end of the script (the two-line init block):
```javascript
initAll();
render();
```

Replace with:
```javascript
initAll();
render();
initGanttResize();
```

- [ ] **Step 3: Verify drag resize in browser**

Hover over the grey handle between the label column and chart — cursor should change to `col-resize`. Drag right: column widens, chart shrinks. Drag left: column narrows. Release: chart re-renders cleanly. Reload: width is restored.

- [ ] **Step 4: Commit**

```bash
git add wbs-planner.html
git commit -m "feat: add drag-to-resize label column with localStorage persistence"
```

---

### Task 6: Fix export — HTML viewer and PNG

**Files:**
- Modify: `wbs-planner.html` — add `buildExportSvg`, update `buildViewerHTML`, update `exportGanttPNG`

- [ ] **Step 1: Add `buildExportSvg` helper before `buildViewerHTML`**

Find `function buildViewerHTML() {` and insert immediately before it:

```javascript
function buildExportSvg(side) {
  const isLabels = side === 'labels';
  const hdr  = document.getElementById(isLabels ? 'gantt-labels-hdr'  : 'gantt-hdr');
  const body = document.getElementById(isLabels ? 'gantt-labels-body' : 'gantt-body');
  if (!hdr || !body) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const w      = +hdr.getAttribute('width');
  const totalH = HDR_H + +body.getAttribute('height');
  return `<svg width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}" xmlns="http://www.w3.org/2000/svg">` +
    hdr.innerHTML +
    `<g transform="translate(0,${HDR_H})">${body.innerHTML}</g>` +
    `</svg>`;
}
```

- [ ] **Step 2: Update `buildViewerHTML` — SVG references**

Find inside `buildViewerHTML`:
```javascript
  const svgLabels    = document.getElementById('gantt-labels').outerHTML;
  const svgContent   = document.getElementById('gantt').outerHTML;
```

Replace with:
```javascript
  const svgLabels  = buildExportSvg('labels');
  const svgContent = buildExportSvg('chart');
```

- [ ] **Step 3: Update `buildViewerHTML` — viewer CSS template**

Find in the `lines` array:
```javascript
    '.chart-container{display:flex;overflow:hidden;align-items:flex-start}svg{display:block}',
    '#gantt-labels{flex-shrink:0;box-shadow:2px 0 6px rgba(0,0,0,.08)}',
    '.chart-scroll{overflow-x:auto;flex:1}',
```

Replace with:
```javascript
    '.chart-container{display:flex;overflow:hidden;align-items:flex-start}svg{display:block}',
    '.chart-container>svg:first-child{flex-shrink:0;box-shadow:2px 0 6px rgba(0,0,0,.08)}',
    '.chart-scroll{overflow-x:auto;flex:1}',
```

(The viewer still uses the old simple layout — `svgLabels` is now a merged SVG element without an ID, so the selector is updated to `>svg:first-child`.)

- [ ] **Step 4: Update `exportGanttPNG`**

Find `function exportGanttPNG(name, scale = 2) {` and replace the entire function body up to (but not including) the `return new Promise(...)` block.

Find:
```javascript
  const labelsEl = document.getElementById('gantt-labels');
  const chartEl  = document.getElementById('gantt');
  const lw  = parseInt(labelsEl.getAttribute('width')  || '0');
  const cw  = parseInt(chartEl.getAttribute('width')   || '0');
  const h   = parseInt(labelsEl.getAttribute('height') || '0');
  if (!lw || !cw || !h) return Promise.resolve();
  const totalW = lw + cw;

  const svgStr = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" viewBox="0 0 ${totalW} ${h}">`,
    `<rect width="${totalW}" height="${h}" fill="#fff"/>`,
    labelsEl.innerHTML,
    `<g transform="translate(${lw},0)">`,
    chartEl.innerHTML,
    `</g>`,
    `</svg>`,
  ].join('');
```

Replace with:
```javascript
  const lHdr  = document.getElementById('gantt-labels-hdr');
  const lBody = document.getElementById('gantt-labels-body');
  const cHdr  = document.getElementById('gantt-hdr');
  const cBody = document.getElementById('gantt-body');
  if (!lHdr || !lBody || !cHdr || !cBody) return Promise.resolve();
  const lw     = +lHdr.getAttribute('width')  || 0;
  const cw     = +cHdr.getAttribute('width')  || 0;
  const bh     = +lBody.getAttribute('height') || 0;
  if (!lw || !cw || !bh) return Promise.resolve();
  const totalW = lw + cw;
  const totalH = HDR_H + bh;

  const svgStr = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`,
    `<rect width="${totalW}" height="${totalH}" fill="#fff"/>`,
    lHdr.innerHTML,
    `<g transform="translate(0,${HDR_H})">${lBody.innerHTML}</g>`,
    `<g transform="translate(${lw},0)">`,
    cHdr.innerHTML,
    `<g transform="translate(0,${HDR_H})">${cBody.innerHTML}</g>`,
    `</g>`,
    `</svg>`,
  ].join('');
```

Also update the canvas sizing inside `img.onload` — find:
```javascript
      canvas.width  = totalW * scale;
      canvas.height = h * scale;
```

Replace with:
```javascript
      canvas.width  = totalW * scale;
      canvas.height = totalH * scale;
```

- [ ] **Step 5: Verify HTML and PNG export in browser**

1. Click "HTML 出力" — open the downloaded file. Chart should look identical to the main app.
2. Click "PNG 出力" — the downloaded PNG should show the full chart (header + body, labels + bars side by side) without any cropping.

- [ ] **Step 6: Commit**

```bash
git add wbs-planner.html
git commit -m "fix: update HTML and PNG export to use merged 4-SVG gantt structure"
```

---

### Task 7: Run E2E tests and verify all pass

- [ ] **Step 1: Run the new E2E tests**

```bash
npx playwright test tests/e2e/gantt-header-resize.spec.js --reporter=list
```

Expected output:
```
✓ date header sticks to top when page scrolls past it
✓ drag resize handle changes label column width
✓ resized label column width persists after reload
```

- [ ] **Step 2: Run the full E2E suite to check for regressions**

```bash
npx playwright test --reporter=list
```

Expected: all previously passing tests continue to pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/gantt-header-resize.spec.js
git commit -m "test: add E2E tests for gantt sticky header and label column resize"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Sticky date header on vertical page scroll | Task 2 (CSS sticky), Task 3 (SVG split), Task 4 (scroll sync) |
| Drag-to-resize label column | Task 2 (handle HTML/CSS), Task 5 (initGanttResize) |
| Width persisted in localStorage | Task 3 (LW init), Task 5 (mouseup saves) |
| Width range 120px–400px | Task 3 (LW init clamp), Task 5 (onMove/onUp clamp) |
| Scroll listener deduplication | Task 4 (`_scrollHandler` removal before re-add) |
| Export (HTML + PNG) compatibility | Task 6 |
| Collapse feature compatibility | `visibleRows`/`lastScheduled` untouched throughout; Task 5 uses `if (lastScheduled)` guard |
| `data-visible-row-count` updated | Task 3 Step 3 (targets `svgLabelsBody`) |

**No placeholders:** All steps contain complete code. ✅

**Type/name consistency:**
- `initGanttScrollSync` is defined in Task 4 and called in Task 3 Step 3. ✅
- `initGanttResize` is defined and called in Task 5. ✅
- `buildExportSvg` is defined and called in Task 6. ✅
- `LW` is mutated in Task 3 (init) and Task 5 (mouseup). ✅
- `lastScheduled` (defined by collapse feature) is read in Tasks 3 and 5 — never reassigned. ✅
