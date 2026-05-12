# Gantt Chart: Sticky Header & Label Column Resize

Date: 2026-05-12

## Overview

Two UX improvements to the Gantt chart in `wbs-planner.html`:

1. **Sticky date header** — the date row stays fixed at the top of the viewport when vertically scrolling the page.
2. **Label column resize** — the "リリース / アイテム / 工程" column width can be adjusted by dragging a handle, and the setting persists in localStorage.

## Context

The Gantt chart currently renders as two SVGs side by side:
- `#gantt-labels` (width=`LW=220px`, height=`totalH`) — label header + label body
- `#gantt` inside `.chart-scroll` (width=`chartW`, height=`totalH`) — date header + chart bars

The date header is embedded in the SVG at y=0–48 (`HDR_H=48`). There is no container-level vertical scroll — the page itself scrolls. The collapse feature (merged 2026-05-12) introduced `visibleRows` filtering and `lastScheduled` for re-rendering without rescheduling.

## Feature 1: Sticky Date Header

### Scroll behaviour

- The page scrolls vertically (no change to this).
- While the Gantt card is in the viewport, the date header row sticks to the top of the screen.
- Once the user scrolls past the Gantt card entirely, the sticky releases automatically (CSS `position: sticky` scoped to its containing block).
- The schedule summary table below the Gantt card is unaffected.

### HTML structure (new)

```
.gantt-card
  .card-header                     ← unchanged (has collapse-all/expand-all buttons)
  .chart-outer  (display: flex)
    .gantt-labels-col  (width: LW px, flex-shrink: 0)
      .gantt-labels-hdr-wrap  (position: sticky; top: 0; z-index: 10; background: #fff)
        <svg id="gantt-labels-hdr">  ← label header, height=HDR_H
      <svg id="gantt-labels-body">   ← label body, height=bodyH
    #gantt-resize-handle  (width: 6px, cursor: col-resize)
    .gantt-right  (flex: 1; overflow: hidden)
      .gantt-date-hdr  (position: sticky; top: 0; z-index: 10; overflow: hidden; background: #fff)
        <svg id="gantt-hdr">         ← date header, height=HDR_H
      .chart-scroll  (overflow-x: auto)
        <svg id="gantt-body">        ← chart bars, height=bodyH
  .legend  ← unchanged
```

**Why `.gantt-date-hdr` is outside `.chart-scroll`:** `position: sticky` does not work through an ancestor with `overflow` set to anything other than `visible`. Placing the date header outside `.chart-scroll` and syncing scroll with JS is required.

### SVG rendering (minimal change)

`renderGantt` continues to generate the same `gL` (labels) and `g` (chart) SVG content strings with the same coordinate system (y=0 is the top of the header, y=HDR_H is the top of the body). The content is applied to all four SVGs using `viewBox` to clip each to its visible region:

```javascript
// Header SVGs — show y=0 to HDR_H
svgLabelsHdr.setAttribute('viewBox', `0 0 ${LW} ${HDR_H}`);
svgLabelsHdr.setAttribute('height', HDR_H);
svgLabelsHdr.innerHTML = gL;

svgHdr.setAttribute('viewBox', `0 0 ${chartW} ${HDR_H}`);
svgHdr.setAttribute('height', HDR_H);
svgHdr.innerHTML = g;

// Body SVGs — show y=HDR_H to totalH
svgLabelsBody.setAttribute('viewBox', `0 ${HDR_H} ${LW} ${bodyH}`);
svgLabelsBody.setAttribute('height', bodyH);
svgLabelsBody.innerHTML = gL;

svgBody.setAttribute('viewBox', `0 ${HDR_H} ${chartW} ${bodyH}`);
svgBody.setAttribute('height', bodyH);
svgBody.innerHTML = g;
```

No changes to the SVG content generation logic (backgrounds, bars, labels, today line, eval zones, collapse click handlers).

The existing `svgL.setAttribute('data-visible-row-count', visibleRows.length)` reference is updated to target `gantt-labels-body`.

### Horizontal scroll sync

The date header SVG is outside `.chart-scroll` so it does not scroll horizontally. A JS listener mirrors the scroll offset:

```javascript
function initGanttScrollSync() {
  const chartScroll = document.querySelector('.chart-scroll');
  const dateHdrSvg  = document.getElementById('gantt-hdr');
  if (!chartScroll || !dateHdrSvg) return;
  chartScroll.addEventListener('scroll', () => {
    dateHdrSvg.style.marginLeft = `-${chartScroll.scrollLeft}px`;
  }, { passive: true });
}
```

Called at the end of `renderGantt` on every render. `.gantt-date-hdr` has `overflow: hidden` so the shifted SVG is clipped correctly. To avoid accumulating duplicate listeners across re-renders, the listener is registered on the `.chart-scroll` element itself using a named function reference stored on the element (`chartScroll._scrollHandler`), replacing any existing one before adding the new one.

## Feature 2: Label Column Resize

### Width variable

`LW` changes from a `const` to a `let`, initialised from localStorage:

```javascript
let LW = (() => {
  const saved = localStorage.getItem('gantt-label-width');
  return saved ? Math.max(120, Math.min(400, +saved)) : 220;
})();
```

Range: 120px – 400px.

### Drag handle

`#gantt-resize-handle` sits between `.gantt-labels-col` and `.gantt-right` in the flex layout (6px wide, `cursor: col-resize`, visual: subtle vertical line).

```javascript
function initGanttResize() {
  const handle = document.getElementById('gantt-resize-handle');
  const labelsCol = document.querySelector('.gantt-labels-col');
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
    const newW = Math.max(120, Math.min(400, startLW + e.clientX - startX));
    labelsCol.style.width = `${newW}px`;  // visual feedback only
  }

  function onUp(e) {
    LW = Math.max(120, Math.min(400, startLW + e.clientX - startX));
    localStorage.setItem('gantt-label-width', LW);
    renderGantt(lastScheduled);           // re-render once on release
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }
}
```

`initGanttResize` is called once at page load (not on every render — the handle element persists).

## Export Compatibility

The existing export code references `gantt-labels` and `gantt`. Both are replaced with a helper that merges header + body SVGs:

```javascript
function buildExportSvg(side) {
  const isLabels = side === 'labels';
  const hdr  = document.getElementById(isLabels ? 'gantt-labels-hdr'  : 'gantt-hdr');
  const body = document.getElementById(isLabels ? 'gantt-labels-body' : 'gantt-body');
  const w       = +hdr.getAttribute('width');
  const totalH  = HDR_H + +body.getAttribute('height');
  return `<svg width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}" xmlns="http://www.w3.org/2000/svg">` +
    hdr.innerHTML +
    `<g transform="translate(0,${HDR_H})">${body.innerHTML}</g>` +
    `</svg>`;
}
```

All call sites that previously read `.outerHTML` of `gantt-labels` / `gantt` are updated to use `buildExportSvg('labels')` / `buildExportSvg('chart')`. Exported PNG and HTML output are visually identical to current behaviour.

## Compatibility with Collapse Feature

The collapse feature (merged 2026-05-12) is fully compatible:

| Collapse feature component | Impact |
|---|---|
| `visibleRows` in `renderGantt` | No change — body SVGs render `visibleRows` as before |
| `lastScheduled` | Used as-is in the drag mouseup handler (`renderGantt(lastScheduled)`) |
| `toggleReleaseCollapse` / `toggleItemCollapse` | Call `renderGantt(lastScheduled)` — unaffected |
| SVG `onclick` handlers (collapse toggles) | Remain in `gL` body content — applied to `gantt-labels-body` |
| `data-visible-row-count` attribute | Updated to target `gantt-labels-body` |

## Files Changed

- `wbs-planner.html` — all changes are self-contained in this single file:
  - HTML: replace `.chart-container` block with new structure
  - CSS: add `.chart-outer`, `.gantt-labels-col`, `.gantt-labels-hdr-wrap`, `.gantt-date-hdr`, `#gantt-resize-handle` rules
  - JS: change `const LW` → `let LW` with localStorage init; update `renderGantt` to target 4 SVGs and call `initGanttScrollSync`; add `initGanttResize` (called once at load); add `buildExportSvg` helper; update export call sites
