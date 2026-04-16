# バグ修正 & UX 改善 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** wbs-planner.html の 6 つの問題（稼働率未反映・工程タイプ名変更の不整合・fixedStart 削除不能・スケジューリング無限ループ・並び替えなし・undo なし）を優先度順に修正する。

**Architecture:** 単一 HTML ファイル（`wbs-planner.html`）のみ変更。外部ライブラリ追加なし。各タスクは独立して動作確認・コミットできる粒度とする。テストフレームワークは使わず、ブラウザでの手動確認を各タスク末尾に記載する。

**Tech Stack:** Vanilla JS, SVG, localStorage（ライブラリ追加なし）

---

## ファイル構成

変更するファイルは 1 つのみ：

| ファイル | 変更箇所 |
|---------|---------|
| `wbs-planner.html` | `runSchedule()`（稼働率・ストール検知）、`renderPhaseTypesList()`（名前変更追従）、`phaseForm()`（fixedStart 削除ボタン）、`wireReleaseEvents()`（各種イベント追加）、`renderReleasesList()` / `renderItemForm()`（並び替えボタン）、フッター HTML（undo ボタン）、グローバル変数（`_undoSnapshot`）|

---

## Task 1: スケジューラー改善（稼働率反映 + ストール検知）

**Files:**
- Modify: `wbs-planner.html` — `runSchedule()` 内の `tasks.push(...)` ブロック（490〜528 行目付近）とメインループ全体（568〜633 行目）

**現状の問題 2 件:**
1. `personBusy[n]++` で 1 だけ加算・`t.daysWorked >= t.totalDays` で完了。utilization が期間に反映されない。
2. 担当者が割り当てられない ready タスクがある場合、`latestRelease + 365` 日まで空ループする。

**修正:** `actualDays = ceil(days / util)` でタスク期間を延伸。30 営業日連続で着手できない場合は早期中断。

- [ ] **Step 1: `tasks.push(...)` ブロックに `actualDays` フィールドを追加する**

498 行目付近、`tasks.push({` ブロック内の `hasConflict: false,` の直後（末尾）に以下を追加する：

```js
          actualDays:     phase.days, // 稼働率適用後の実消費日数（担当者確定時に上書き）
```

変更後の `tasks.push` の末尾は以下のようになる：

```js
          daysWorked:     0,
          assignedPeople: [],
          hasConflict:    false,
          actualDays:     phase.days,
        });
```

- [ ] **Step 2: メインループ全体（568〜633 行目）を以下に置き換える**

`let d = new Date(_start);` から `}` （ループの閉じ括弧）までを丸ごと以下に置き換える：

```js
  let d = new Date(_start);
  let stalledDays = 0;
  const MAX_STALLED = 30;

  while (d <= limit) {
    if (!isBiz(d, hols)) { d = addDays(d, 1); continue; }

    // 固定開始日タスクを強制開始
    for (const t of tasks) {
      if (t.isFixed && t.status === 'waiting' && +t.fixedStartDate === +d) {
        const assigned = pickPeople(t, d);
        t.status = 'inProgress'; t.startDate = new Date(d);
        if (assigned) {
          t.assignedPeople = assigned;
          const utils = assigned.map(n => {
            const p = C.people.find(x => x.name === n);
            return (p && p.utilization > 0) ? p.utilization : 1.0;
          });
          t.actualDays = Math.ceil(t.totalDays / Math.min(...utils));
          assigned.forEach(n => personBusy[n]++);
        } else {
          const phase = C.releases[t.releaseIdx].items[t.itemIdx].phases[t.phaseIdx];
          const fb = phase.allowedPeople ? phase.allowedPeople[0] : null;
          t.assignedPeople = fb ? [fb + '(要調整)'] : [];
          t.hasConflict = true;
        }
      }
    }

    // 先行完了 → ready（かつリリース開始日を過ぎているもの）
    for (const t of tasks) {
      if (t.status === 'waiting' && !t.isFixed && d >= t.releaseStartDate) {
        const pred = t.predId ? taskMap[t.predId] : null;
        if (!pred || pred.status === 'complete') t.status = 'ready';
      }
    }

    // ready タスクを優先度順に着手（リリース順 → remaining days 順）
    const ready = tasks
      .filter(t => t.status === 'ready')
      .sort((a, b) =>
        b.releasePriority - a.releasePriority ||
        b.priority        - a.priority        ||
        a.releaseIdx      - b.releaseIdx      ||
        a.itemIdx         - b.itemIdx         ||
        a.phaseIdx        - b.phaseIdx
      );

    for (const t of ready) {
      if (t.isBackground) {
        t.status = 'inProgress'; t.startDate = new Date(d); t.assignedPeople = [];
        // background タスクは稼働率の影響なし。actualDays は tasks.push 時の初期値（= phase.days）をそのまま使う
      } else {
        const assigned = pickPeople(t, d);
        if (assigned) {
          t.status = 'inProgress'; t.startDate = new Date(d);
          t.assignedPeople = assigned;
          const utils = assigned.map(n => {
            const p = C.people.find(x => x.name === n);
            return (p && p.utilization > 0) ? p.utilization : 1.0;
          });
          t.actualDays = Math.ceil(t.totalDays / Math.min(...utils));
          assigned.forEach(n => personBusy[n]++);
        }
      }
    }

    // 作業実行 & 完了判定（actualDays ベース）
    for (const t of tasks) {
      if (t.status === 'inProgress') {
        t.daysWorked++;
        if (t.daysWorked >= t.actualDays) {
          t.status = 'complete'; t.endDate = new Date(d);
          if (!t.isBackground) t.assignedPeople.forEach(n => { if (n in personBusy) personBusy[n]--; });
        }
      }
    }

    // ── ストール検知: ready タスクがあるが今日一件も着手できなかった日が続く場合は中断 ──
    const newStartCount = tasks.filter(t =>
      t.status === 'inProgress' && t.startDate?.getTime() === d.getTime()
    ).length;
    const readyRemaining = tasks.filter(t => t.status === 'ready').length;
    if (readyRemaining > 0 && newStartCount === 0) {
      stalledDays++;
      if (stalledDays >= MAX_STALLED) break;
    } else {
      stalledDays = 0;
    }

    if (tasks.every(t => t.status === 'complete')) break;
    d = addDays(d, 1);
  }
```

- [ ] **Step 3: ブラウザで確認する**

**稼働率の確認:**
1. 担当者の稼働率を 80%（0.8）に設定する
2. 10 日のタスクを作成してスケジュールを実行する
3. ガントチャートでそのバーが **13 営業日分**（`ceil(10/0.8) = 13`）の長さになること
4. 稼働率 100% の担当者は従来通り 10 日分のバーになること

**ストール検知の確認:**
5. 担当者を 0 人にしてアイテムを複数作成し、スケジュールを実行する
6. ページがフリーズせず数秒以内に警告バナーが表示されること

**通常動作の確認:**
7. background タスクが正常にスケジュールされること（バーが表示されること）
8. コンソールエラーがないこと

- [ ] **Step 4: コミットする**

```bash
git add wbs-planner.html
git commit -m "fix: apply utilization to task duration and add stall guard to scheduler"
```

---

## Task 2: 工程タイプ名変更時にフェーズと担当者を追従させる

**Files:**
- Modify: `wbs-planner.html` — `renderPhaseTypesList()` 内のイベントハンドラー（1100〜1109 行目付近）

**現状:** `C.phaseTypes[i].name` を変更しても既存フェーズの `phase.type` と担当者の `p.phases` は旧名のまま。スケジューリング時に `ptDef` が `undefined` になりガントバー色が灰色になる。

- [ ] **Step 1: `renderPhaseTypesList()` 内のイベントハンドラーを修正する**

`el.querySelectorAll('[data-pt]').forEach(...)` ブロック（1100〜1109 行目付近）を以下に置き換える：

```js
  el.querySelectorAll('[data-pt]').forEach(inp => {
    const ev = inp.type==='color' ? 'input' : 'change';
    inp.addEventListener(ev, e => {
      const i=parseInt(e.target.dataset.pt), f=e.target.dataset.f;
      if (f === 'name') {
        const oldName = C.phaseTypes[i].name;
        const newName = e.target.value;
        C.phaseTypes[i].name = newName;
        if (oldName !== newName) {
          // 全リリースの全フェーズの phase.type を追従
          C.releases.forEach(r =>
            r.items.forEach(item =>
              item.phases.forEach(ph => { if (ph.type === oldName) ph.type = newName; })
            )
          );
          // 担当者の担当可能工程リストも追従
          C.people.forEach(p => {
            p.phases = p.phases.map(n => n === oldName ? newName : n);
          });
        }
      } else {
        C.phaseTypes[i][f] = e.target.type==='checkbox' ? e.target.checked : e.target.value;
      }
      render();
      if (f === 'name') { renderPhaseTypesList(); renderPeopleList(); renderReleasesList(); }
      else { renderPhaseTypesList(); }
    });
  });
```

- [ ] **Step 2: ブラウザで確認する**

1. 工程タイプタブで「要件定義」を「要件・設計」に変更する
2. アイテムタブを開き、既存フェーズのドロップダウンが「要件・設計」になっていること
3. 担当者タブで「担当可能工程」の表示が「要件・設計」になっていること
4. ガントチャートのバー色が灰色にならず正しい色で表示されること
5. コンソールエラーがないこと

- [ ] **Step 3: コミットする**

```bash
git add wbs-planner.html
git commit -m "fix: cascade phase type name change to existing phases and people"
```

---

## Task 3: 固定開始日（fixedStart）の削除ボタンを追加する

**Files:**
- Modify: `wbs-planner.html` — `phaseForm()`（1380〜1386 行目）、`wireReleaseEvents()`（固定開始日追加ハンドラーの直後）

**現状:** `hasFixed` が true の場合、date input のみ表示され UI から削除できない。

- [ ] **Step 1: `phaseForm()` の `hasFixed` ブランチを修正する**

`phaseForm()` 関数内の以下の部分（1380〜1386 行目付近）を：

```js
    ${hasFixed
      ? `<div class="fg" style="margin-bottom:0"><label>固定開始日</label>
          <input type="date" value="${ph.fixedStart}" data-pf="fixedStart" data-ri="${rIdx}" data-ii="${iIdx}" data-pj="${pIdx}">
        </div>`
      : `<button class="btn btn-secondary btn-sm" style="font-size:.73rem"
          data-add-fixed-ri="${rIdx}" data-add-fixed-ii="${iIdx}" data-add-fixed-pj="${pIdx}">＋ 固定開始日を設定</button>`
    }
```

以下に置き換える：

```js
    ${hasFixed
      ? `<div class="fg" style="margin-bottom:0"><label>固定開始日</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="date" value="${ph.fixedStart}" data-pf="fixedStart" data-ri="${rIdx}" data-ii="${iIdx}" data-pj="${pIdx}"
              style="flex:1;padding:7px 9px;border:1px solid #D1D5DB;border-radius:6px;font-size:.84rem">
            <button type="button" class="btn btn-danger"
              data-del-fixed-ri="${rIdx}" data-del-fixed-ii="${iIdx}" data-del-fixed-pj="${pIdx}"
              onclick="event.stopPropagation()">× 削除</button>
          </div>
        </div>`
      : `<button class="btn btn-secondary btn-sm" style="font-size:.73rem"
          data-add-fixed-ri="${rIdx}" data-add-fixed-ii="${iIdx}" data-add-fixed-pj="${pIdx}">＋ 固定開始日を設定</button>`
    }
```

- [ ] **Step 2: `wireReleaseEvents()` に固定開始日削除ハンドラーを追加する**

`wireReleaseEvents()` 内の固定開始日追加ハンドラー（`el.querySelectorAll('[data-add-fixed-ri]')...`）の直後に以下を追加する：

```js
  // ── 固定開始日削除 ──
  el.querySelectorAll('[data-del-fixed-ri]').forEach(btn => btn.addEventListener('click', () => {
    const ri = parseInt(btn.dataset.delFixedRi);
    const ii = parseInt(btn.dataset.delFixedIi);
    const pj = parseInt(btn.dataset.delFixedPj);
    C.releases[ri].items[ii].phases[pj].fixedStart = null;
    render(); renderReleasesList();
  }));
```

- [ ] **Step 3: ブラウザで確認する**

1. フェーズに「＋ 固定開始日を設定」で開始日を設定する
2. 表示されたフォームに「× 削除」ボタンが表示されること
3. 削除ボタンをクリックすると「＋ 固定開始日を設定」ボタンに戻ること
4. ガントチャートが再計算されること（固定開始日なしのスケジュールになる）
5. コンソールエラーがないこと

- [ ] **Step 4: コミットする**

```bash
git add wbs-planner.html
git commit -m "fix: add delete button for fixedStart in phase form"
```

---

## Task 4: リリース・アイテムの並び替えボタン（↑/↓）

**Files:**
- Modify: `wbs-planner.html` — `renderReleasesList()`（リリース見出し部分）、`renderItemForm()`（アイテム見出し部分）、`wireReleaseEvents()`（ハンドラー追加）

- [ ] **Step 1: リリース見出しに ↑/↓ ボタンを追加する**

`renderReleasesList()` 内のリリース見出し `<div class="li-head" ...>` の内側、`<button class="btn btn-danger" data-del-release=...>` の直前に ↑/↓ ボタンを追加する。

変更前（1218〜1222 行目付近）：
```js
      <div class="li-head" onclick="toggleLI(this)" style="background:${color}1a">
        <span class="swatch" style="background:${color}"></span>
        <span class="li-name" style="color:${color}">${esc(release.name)}</span>
        <span class="li-sub">${esc(dateRange)}</span>
        <button class="btn btn-danger" data-del-release="${rIdx}" onclick="event.stopPropagation()">削除</button>
      </div>
```

変更後：
```js
      <div class="li-head" onclick="toggleLI(this)" style="background:${color}1a">
        <span class="swatch" style="background:${color}"></span>
        <span class="li-name" style="color:${color}">${esc(release.name)}</span>
        <span class="li-sub">${esc(dateRange)}</span>
        <button class="btn btn-secondary btn-sm" data-mv-release="${rIdx}" data-dir="-1"
          onclick="event.stopPropagation()" ${rIdx === 0 ? 'disabled' : ''} style="padding:2px 7px">↑</button>
        <button class="btn btn-secondary btn-sm" data-mv-release="${rIdx}" data-dir="1"
          onclick="event.stopPropagation()" ${rIdx === (C.releases.length - 1) ? 'disabled' : ''} style="padding:2px 7px">↓</button>
        <button class="btn btn-danger" data-del-release="${rIdx}" onclick="event.stopPropagation()">削除</button>
      </div>
```

- [ ] **Step 2: アイテム見出しに ↑/↓ ボタンを追加する**

`renderItemForm()` 内の `<div class="li-head" ...>` の内側、`<button class="btn btn-danger" data-del-item-ri=...>` の直前に ↑/↓ ボタンを追加する。

変更前（1305〜1309 行目付近）：
```js
    <div class="li-head" onclick="toggleLI(this)">
      <span class="li-name">${esc(item.name)}</span>
      <span class="li-sub">${esc(item.category)}</span>
      <button class="btn btn-danger" data-del-item-ri="${rIdx}" data-del-item-ii="${iIdx}" onclick="event.stopPropagation()">削除</button>
    </div>
```

変更後：
```js
    <div class="li-head" onclick="toggleLI(this)">
      <span class="li-name">${esc(item.name)}</span>
      <span class="li-sub">${esc(item.category)}</span>
      <button class="btn btn-secondary btn-sm" data-mv-item-ri="${rIdx}" data-mv-item-ii="${iIdx}" data-dir="-1"
        onclick="event.stopPropagation()" ${iIdx === 0 ? 'disabled' : ''} style="padding:2px 7px">↑</button>
      <button class="btn btn-secondary btn-sm" data-mv-item-ri="${rIdx}" data-mv-item-ii="${iIdx}" data-dir="1"
        onclick="event.stopPropagation()" ${iIdx === (C.releases[rIdx].items.length - 1) ? 'disabled' : ''} style="padding:2px 7px">↓</button>
      <button class="btn btn-danger" data-del-item-ri="${rIdx}" data-del-item-ii="${iIdx}" onclick="event.stopPropagation()">削除</button>
    </div>
```

- [ ] **Step 3: `wireReleaseEvents()` にリリース並び替えハンドラーを追加する**

`wireReleaseEvents()` 内のリリース削除ハンドラー（`el.querySelectorAll('[data-del-release]')...`）の直前に以下を追加する：

```js
  // ── リリース並び替え ──
  el.querySelectorAll('[data-mv-release]').forEach(btn => btn.addEventListener('click', () => {
    const ri  = parseInt(btn.dataset.mvRelease);
    const dir = parseInt(btn.dataset.dir);
    const to  = ri + dir;
    if (to < 0 || to >= C.releases.length) return;
    [C.releases[ri], C.releases[to]] = [C.releases[to], C.releases[ri]];
    render(); renderReleasesList();
  }));
```

- [ ] **Step 4: `wireReleaseEvents()` にアイテム並び替えハンドラーを追加する**

アイテム削除ハンドラー（`el.querySelectorAll('[data-del-item-ri]')...`）の直前に以下を追加する：

```js
  // ── アイテム並び替え ──
  el.querySelectorAll('[data-mv-item-ri]').forEach(btn => btn.addEventListener('click', () => {
    const ri  = parseInt(btn.dataset.mvItemRi);
    const ii  = parseInt(btn.dataset.mvItemIi);
    const dir = parseInt(btn.dataset.dir);
    const to  = ii + dir;
    if (to < 0 || to >= C.releases[ri].items.length) return;
    [C.releases[ri].items[ii], C.releases[ri].items[to]] = [C.releases[ri].items[to], C.releases[ri].items[ii]];
    render(); renderReleasesList();
  }));
```

- [ ] **Step 5: ブラウザで確認する**

1. リリースを 2 件追加し、↑/↓ ボタンでリリースの順序が入れ替わること
2. 先頭リリースの ↑ ボタンが `disabled`、末尾の ↓ ボタンが `disabled` であること
3. アイテムを 2 件追加し、↑/↓ でアイテムの順序が変わること
4. ガントチャートの描画順がリリース・アイテムの並び順に従って変わること
5. コンソールエラーがないこと

- [ ] **Step 6: コミットする**

```bash
git add wbs-planner.html
git commit -m "feat: add up/down reorder buttons for releases and items"
```

---

## Task 5: 削除操作の undo（1 段階）

**Files:**
- Modify: `wbs-planner.html` — グローバル変数エリア（356 行目付近）、フッター HTML（252〜257 行目）、`wireReleaseEvents()` の削除ハンドラー 3 箇所（リリース削除・アイテム削除・フェーズ削除）、`initAll()` の直前

- [ ] **Step 1: グローバル変数 `_undoSnapshot` と `updateUndoBtn()` 関数を追加する**

`let C = loadConfig();` の直後（356 行目付近）に以下を追加する：

```js
let _undoSnapshot = null;
function updateUndoBtn() {
  const btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = !_undoSnapshot;
}
```

- [ ] **Step 2: フッターに「↩ 元に戻す」ボタンを追加する**

252〜257 行目のフッター HTML を以下に置き換える：

```html
  <div class="sb-foot">
    <button class="btn btn-primary" id="btn-html">HTML 出力</button>
    <button class="btn btn-secondary" id="btn-png">PNG 出力</button>
    <button class="btn btn-secondary" id="btn-json-save">JSON 保存</button>
    <label class="btn btn-secondary" style="cursor:pointer">JSON 読込<input type="file" id="f-json-load" accept=".json" style="display:none"></label>
    <button class="btn btn-secondary" id="btn-undo" disabled>↩ 元に戻す</button>
  </div>
```

- [ ] **Step 3: リリース削除ハンドラーにスナップショット保存を追加する**

`wireReleaseEvents()` 内のリリース削除ハンドラーを以下に置き換える：

```js
  // ── リリース削除 ──
  el.querySelectorAll('[data-del-release]').forEach(btn => btn.addEventListener('click', () => {
    const ri = parseInt(btn.dataset.delRelease);
    if (!confirm(`リリース「${C.releases[ri].name}」と内包するすべてのアイテムを削除しますか？`)) return;
    _undoSnapshot = JSON.stringify(C);
    updateUndoBtn();
    C.releases.splice(ri, 1);
    render(); renderReleasesList();
  }));
```

- [ ] **Step 4: アイテム削除ハンドラーにスナップショット保存を追加する**

アイテム削除ハンドラーを以下に置き換える：

```js
  // ── アイテム削除 ──
  el.querySelectorAll('[data-del-item-ri]').forEach(btn => btn.addEventListener('click', () => {
    const ri = parseInt(btn.dataset.delItemRi);
    const ii = parseInt(btn.dataset.delItemIi);
    _undoSnapshot = JSON.stringify(C);
    updateUndoBtn();
    C.releases[ri].items.splice(ii, 1);
    render(); renderReleasesList();
  }));
```

- [ ] **Step 5: フェーズ削除ハンドラーにスナップショット保存を追加する**

フェーズ削除ハンドラーを以下に置き換える：

```js
  // ── フェーズ削除 ──
  el.querySelectorAll('[data-del-ph-ri]').forEach(btn => btn.addEventListener('click', () => {
    const ri = parseInt(btn.dataset.delPhRi);
    const ii = parseInt(btn.dataset.delPhIi);
    const pj = parseInt(btn.dataset.delPhPj);
    _undoSnapshot = JSON.stringify(C);
    updateUndoBtn();
    C.releases[ri].items[ii].phases.splice(pj, 1);
    render(); renderReleasesList();
  }));
```

- [ ] **Step 6: undo ボタンのイベントリスナーを `initAll()` の直前に追加する**

`function initAll() {`（2248 行目付近）の直前に以下を追加する：

```js
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!_undoSnapshot) return;
  C = JSON.parse(_undoSnapshot);
  _undoSnapshot = null;
  updateUndoBtn();
  initAll(); render();
});
```

- [ ] **Step 7: ブラウザで確認する**

1. ページを開いた直後、「↩ 元に戻す」ボタンが `disabled` であること
2. アイテムを削除すると「↩ 元に戻す」が有効になること
3. クリックするとアイテムが復元されること
4. 復元後は再び `disabled` になること（再 undo 不可）
5. フェーズ削除・リリース削除でも同様に動作すること
6. コンソールエラーがないこと

- [ ] **Step 8: コミットする**

```bash
git add wbs-planner.html
git commit -m "feat: add 1-level undo for release/item/phase deletions"
```
