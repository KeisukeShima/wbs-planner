# バグ修正 & UX 改善 設計書

**Date:** 2026-04-16
**File:** `wbs-planner.html`（単一ファイル、外部ライブラリ追加なし）

---

## スコープ

以下 6 点を優先度順に修正する。

| # | 分類 | 概要 |
|---|------|------|
| 1 | バグ | 稼働率（utilization）をタスク期間に反映 |
| 2 | バグ | 工程タイプ名変更時に既存フェーズの `phase.type` を追従させる |
| 3 | バグ | 固定開始日（fixedStart）の削除手段を追加 |
| 4 | 堅牢性 | スケジューリング上限ループの早期中断 |
| 5 | UX | リリース・アイテムの並び替え（↑/↓ボタン） |
| 6 | UX | 削除操作の undo（1段階） |

---

## 詳細設計

### 1. 稼働率をタスク期間に反映

**現状の問題:**
`utilization` フィールドは「担当者が空きかどうか」の判定にのみ使われており、タスクの実際の消費営業日数には反映されていない。稼働率 80% の担当者が 10 日タスクを受け持っても、10 営業日で完了扱いになる。

**修正方針（選択肢 A）:**
`actualDays = Math.ceil(phase.days / utilization)` を計算し、担当者の占有期間として使用する。`personBusy[name]` に `actualDays` を加算し、毎営業日 1 ずつ減算する。

**変更箇所:**

1. `tasks.push(...)` 内に `actualDays` フィールドを追加:
   ```js
   const person = C.people.find(p => phase.allowedPeople?.[0] === p.name) ?? null;
   // actualDays はタスク展開時点では確定できないため、担当者決定時に計算する
   actualDays: phase.days, // 後で割り当て時に上書き
   ```
   ※ 担当者が確定するのは `pickPeople()` 呼び出し後のため、`personBusy` への加算タイミングで計算する。

2. タスク開始時（`assigned.forEach(n => personBusy[n]++)`）を以下に変更:
   ```js
   assigned.forEach(n => {
     const p = C.people.find(x => x.name === n);
     const util = (p?.utilization > 0) ? p.utilization : 1.0;
     const actualDays = Math.ceil(t.totalDays / util);
     personBusy[n] += actualDays;
     t.actualDays = actualDays; // タスクに記録（完了判定用）
   });
   ```

3. `personBusy` の減算（完了時の `personBusy[n]--`）は変更しない。毎営業日ループで1ずつ減算する仕組みはそのまま。

4. ガントバーの長さは `t.startDate` ～ `t.endDate` で描画するため、自動的に延伸される。サマリーテーブルの「日数」列は `countBiz(startDate, endDate, hols)` を表示するので実際の占有日数が表示される。

**`requireAll` の場合:**
複数担当者全員の utilization を考慮し、最も低い utilization の担当者で `actualDays` を計算する（最も遅い人に合わせる）。

**`background: true` の場合:**
担当者を消費しないため、utilization は無関係。変更なし。

---

### 2. 工程タイプ名変更時のフェーズ追従

**現状の問題:**
`C.phaseTypes[i].name` を変更しても、各リリースの `phase.type`（文字列）は旧名のまま残る。スケジューリング時に `ptDef` が `undefined` になり、`inEval` が常に `false` になる。ガントバーの色も `phaseColor[t.phaseType]` でヒットせず灰色になる。

**修正方針:**
`renderPhaseTypesList()` 内の `data-f="name"` input のイベントハンドラーで、名前変更前に旧名を保存し、変更後に全フェーズを一括更新する。

```js
// 変更前: 旧名を記録
const oldName = C.phaseTypes[i].name;
// 変更後: 新名を設定
C.phaseTypes[i].name = e.target.value;
// 全フェーズを追従
if (oldName !== C.phaseTypes[i].name) {
  C.releases.forEach(r =>
    r.items.forEach(item =>
      item.phases.forEach(ph => {
        if (ph.type === oldName) ph.type = C.phaseTypes[i].name;
      })
    )
  );
  renderReleasesList();
}
```

また `renderPeopleList()` 内の `p.phases` も追従させる:
```js
C.people.forEach(p => {
  p.phases = p.phases.map(n => n === oldName ? C.phaseTypes[i].name : n);
});
```

---

### 3. 固定開始日（fixedStart）の削除ボタン

**現状の問題:**
`phaseForm()` 内で `hasFixed` が true の場合、date input が表示されるが削除ボタンがない。一度設定した固定開始日を UI から削除できない。

**修正方針:**
`hasFixed` が true の場合の HTML に「× 削除」ボタンを追加する:

```html
<div class="fg" style="margin-bottom:0">
  <label>固定開始日</label>
  <div style="display:flex;gap:6px;align-items:center">
    <input type="date" value="${ph.fixedStart}" data-pf="fixedStart" ...>
    <button class="btn btn-danger"
      data-del-fixed-ri="${rIdx}" data-del-fixed-ii="${iIdx}" data-del-fixed-pj="${pIdx}">×</button>
  </div>
</div>
```

`wireReleaseEvents()` に `[data-del-fixed-ri]` のハンドラーを追加:
```js
el.querySelectorAll('[data-del-fixed-ri]').forEach(btn => btn.addEventListener('click', e => {
  const ri = parseInt(e.target.dataset.delFixedRi);
  const ii = parseInt(e.target.dataset.delFixedIi);
  const pj = parseInt(e.target.dataset.delFixedPj);
  C.releases[ri].items[ii].phases[pj].fixedStart = null;
  render(); renderReleasesList();
}));
```

---

### 4. スケジューリング上限ループの早期中断

**現状の問題:**
タスクを担当できる担当者がいない場合、`limit = addDays(latestRelease, 365)` まで毎日空回りする。アイテムが多いと数秒単位の遅延が発生しうる。

**修正方針:**
「ready タスクが存在するが、誰も割り当てられなかった日」が連続した場合に早期中断する。

```js
let stalledDays = 0;
const MAX_STALLED = 30; // 30営業日連続で割り当て不可なら中断

while (d <= limit) {
  // ...既存ロジック（fixed → ready → assign → work）...

  // この日に新しく着手したタスク数（background 含む）
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

`MAX_STALLED = 30` は、最も遅い `availableFrom` を持つ担当者が参画するまでの最大猶予として十分な値。将来的に設定可能にすることも可能だが、今回は固定値とする。

---

### 5. リリース・アイテムの並び替え（↑/↓ボタン）

**対象:**
- リリースの並び替え（`C.releases` 配列のスワップ）
- アイテムの並び替え（`C.releases[rIdx].items` 配列のスワップ）
- フェーズの並び替えは今回スコープ外

**UI:**
各リリース見出し・アイテム見出しに ↑/↓ ボタンを追加。先頭要素の ↑ と末尾要素の ↓ は `disabled`。

```html
<!-- リリース見出し内 -->
<button class="btn btn-secondary btn-sm" data-mv-release="${rIdx}" data-dir="-1"
  ${rIdx === 0 ? 'disabled' : ''}>↑</button>
<button class="btn btn-secondary btn-sm" data-mv-release="${rIdx}" data-dir="1"
  ${rIdx === C.releases.length - 1 ? 'disabled' : ''}>↓</button>
```

**ハンドラー（リリース）:**
```js
el.querySelectorAll('[data-mv-release]').forEach(btn => btn.addEventListener('click', e => {
  const ri  = parseInt(e.target.dataset.mvRelease);
  const dir = parseInt(e.target.dataset.dir);
  const to  = ri + dir;
  if (to < 0 || to >= C.releases.length) return;
  [C.releases[ri], C.releases[to]] = [C.releases[to], C.releases[ri]];
  render(); renderReleasesList();
}));
```

アイテムも同様のパターンで実装（`data-mv-item-ri`, `data-mv-item-ii`, `data-dir`）。

---

### 6. undo（削除操作の1段階取り消し）

**対象操作:**
リリース削除・アイテム削除・フェーズ削除の3種類。

**実装:**

1. グローバル変数を追加:
   ```js
   let _undoSnapshot = null;
   ```

2. 削除ハンドラーの先頭で状態を保存:
   ```js
   _undoSnapshot = JSON.stringify(C);
   updateUndoBtn();
   ```

3. フッターに「↩ 元に戻す」ボタンを追加:
   ```html
   <button class="btn btn-secondary" id="btn-undo" disabled>↩ 元に戻す</button>
   ```

4. undo ボタンのハンドラー:
   ```js
   document.getElementById('btn-undo').addEventListener('click', () => {
     if (!_undoSnapshot) return;
     C = JSON.parse(_undoSnapshot);
     _undoSnapshot = null;
     updateUndoBtn();
     initAll(); render();
   });
   function updateUndoBtn() {
     document.getElementById('btn-undo').disabled = !_undoSnapshot;
   }
   ```

**スコープ外:** undo を複数段階にすること、undo 後の redo。

---

## 変更ファイル

`wbs-planner.html` のみ（単一ファイル構成は維持）。

## テスト観点

| # | 確認項目 |
|---|---------|
| 1 | utilization 0.8 の担当者が 10 日タスクを担当 → ガントバーが 13 日分になる |
| 1 | utilization 1.0 の担当者 → 既存と同じ挙動 |
| 2 | 工程タイプ名を変更 → 既存フェーズのドロップダウンと型が追従する |
| 2 | 担当者の「担当可能工程」も旧名→新名に追従する |
| 3 | 固定開始日設定後に × ボタンで削除 → `fixedStart: null` になる |
| 4 | 担当者なしでアイテム多数 → 365 日ループせず 30 営業日以内に終了 |
| 5 | リリースの ↑/↓ でガントの表示順が変わる |
| 5 | 先頭リリースの ↑ と末尾リリースの ↓ が disabled |
| 5 | アイテムの ↑/↓ でリリース内の順序が変わる |
| 6 | アイテム削除後に「↩ 元に戻す」でアイテムが復元される |
| 6 | undo 後は再度 undo できない（ボタンが disabled） |
