# ガントチャート折りたたみ機能 設計仕様

**日付:** 2026-05-12  
**対象ファイル:** `wbs-planner.html`

---

## 概要

ガントチャートのラベル行をクリックすることで、リリース単位・アイテム単位で行を折りたたみ/展開できる機能を追加する。さらに「全折りたたみ」「全展開」ボタンをガントカードヘッダーに追加する。

---

## 要件

| 項目 | 内容 |
|------|------|
| 折りたたみ単位 | リリース行（配下のアイテム・工程を一括）、アイテム行（配下の工程のみ） |
| 操作方法 | ラベルパネル上のリリース行/アイテム行をクリック |
| 一括操作 | ガントカードヘッダーに「▶ 全折りたたみ」「▼ 全展開」ボタン |
| 状態の保持 | `localStorage`に保存し、ページリロード後も復元する |
| テーブル連動 | ガントチャートの折りたたみ状態をスケジュールサマリーテーブルにも反映する |

---

## 状態管理

### データ構造

```js
let ganttCollapse = {
  releases: {},  // { [releaseId]: true }  → そのリリースが折りたたみ中
  items: {},     // { "${releaseId}_${itemIdx}": true } → そのアイテムが折りたたみ中
};
```

- `C`（プロジェクトデータ）とは完全に独立したUIステートとして管理する
- localStorageキー: `gantt-collapse-state`

### 保存・復元

```js
function loadCollapseState() {
  try {
    const s = localStorage.getItem('gantt-collapse-state');
    return s ? JSON.parse(s) : { releases: {}, items: {} };
  } catch { return { releases: {}, items: {} }; }
}

function saveCollapseState() {
  try { localStorage.setItem('gantt-collapse-state', JSON.stringify(ganttCollapse)); } catch {}
}
```

---

## ガントチャートへの変更

### rows配列フィルタリング（`renderGantt`内）

rows配列を構築した後、`ganttCollapse`を参照して表示対象の行だけを含む`visibleRows`配列を作る：

```js
const visibleRows = [];
for (const row of rows) {
  if (row.kind === 'release') {
    visibleRows.push(row);
  } else if (row.kind === 'hdr') {
    // hdr行には meta がない。rIdx から releaseId を取得する
    const releaseId = C.releases[row.rIdx]?.id;
    if (ganttCollapse.releases[releaseId]) continue;
    visibleRows.push(row);
  } else {
    // task行: リリースまたはアイテムが折りたたまれていたらスキップ
    const releaseId = C.releases[row.task.releaseIdx]?.id;
    if (ganttCollapse.releases[releaseId]) continue;
    const itemKey = `${releaseId}_${row.task.itemIdx}`;
    if (ganttCollapse.items[itemKey]) continue;
    visibleRows.push(row);
  }
}
```

実際のレンダリングには`rows`の代わりに`visibleRows`を使う。

**eval zone の高さ再計算**: `visibleRows`に切り替えると`rowCount`（eval zoneの高さ計算用）も`visibleRows`ベースで計算し直す必要がある：

```js
for (let i = 0; i < visibleRows.length; i++) {
  if (visibleRows[i].kind === 'release') {
    let j = i + 1;
    while (j < visibleRows.length && visibleRows[j].kind !== 'release') j++;
    visibleRows[i].visibleRowCount = j - i;  // rowCount とは別プロパティ
  }
}
```

eval zone描画時は`row.visibleRowCount`を使う。

### ラベル行のクリック領域

リリース行・アイテム行のラベルに、透明な`<rect>`をオーバーレイしてクリックイベントを受け取る：

```js
// リリース行
gL += `<rect x="0" y="${ry}" width="${LW}" height="${ROW_H}" fill="transparent" style="cursor:pointer" onclick="toggleReleaseCollapse('${releaseId}')"/>`;

// アイテム行
gL += `<rect x="0" y="${ry}" width="${LW}" height="${ROW_H}" fill="transparent" style="cursor:pointer" onclick="toggleItemCollapse('${releaseId}', ${row.iIdx})"/>`;
```

### 展開/折りたたみアイコン

| 状態 | アイコン |
|------|---------|
| 展開中 | `▼` |
| 折りたたみ中 | `▶` |

リリース折りたたみ時はラベルに件数サマリーを追加：
```
▶ リリース名  (Nアイテム)
```

アイテム折りたたみ時はアイテム行に工程の開始〜終了範囲を示すサマリーバーを表示：
- 工程のうち最も早い`startDate`〜最も遅い`endDate`の薄いグレーバー（opacity 0.35）

### ラベルヘッダーのテキスト変更

現在: `リリース / アイテム / 工程`  
変更なし（そのまま維持）

---

## ガントカードヘッダーへのボタン追加

HTML側の`#gantt-card`の`.card-header`を変更：

```html
<div class="card-header" style="display:flex; align-items:center;">
  ガントチャート
  <div style="margin-left:auto; display:flex; gap:6px;">
    <button class="btn btn-secondary btn-sm" id="btn-collapse-all">▶ 全折りたたみ</button>
    <button class="btn btn-secondary btn-sm" id="btn-expand-all">▼ 全展開</button>
  </div>
</div>
```

ボタンのイベントハンドラ：

```js
document.getElementById('btn-collapse-all').addEventListener('click', () => {
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

`lastScheduled`は`render()`の結果をキャッシュしておく変数（後述）。

---

## テーブルへの連動

`renderTable()`内でも`ganttCollapse`を参照し、折りたたまれているリリース・アイテムの行を出力しない：

```js
tasks.forEach(t => {
  const releaseId = C.releases[t.releaseIdx]?.id;
  
  // リリース見出し行（折りたたみ中でも見出しは出す）
  if (t.releaseIdx !== prevReleaseIdx) {
    // ... 既存のリリース見出し行出力
    prevReleaseIdx = t.releaseIdx;
    prevItemKey = null;
  }

  // リリースが折りたたまれていたら以降の行をスキップ
  if (ganttCollapse.releases[releaseId]) return;

  const itemKey = `${t.releaseIdx}-${t.itemIdx}`;
  if (itemKey !== prevItemKey) {
    // ... 既存のアイテム見出し行出力
    prevItemKey = itemKey;
  }

  // アイテムが折りたたまれていたらタスク行をスキップ
  const collapseItemKey = `${releaseId}_${t.itemIdx}`;
  if (ganttCollapse.items[collapseItemKey]) return;

  // ... 既存のタスク行出力
});
```

---

## `lastScheduled`キャッシュ

折りたたみトグル時に`schedule()`を再実行する必要はない。`render()`の結果を保持しておく：

```js
let lastScheduled = null;

function render() {
  // ...（既存処理）
  lastScheduled = schedule();
  renderGantt(lastScheduled);
  renderTable(lastScheduled);
  // ...
}
```

---

## トグル関数

```js
function toggleReleaseCollapse(releaseId) {
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

---

## エラーハンドリング・エッジケース

- リリースが1件もない場合: 既存の早期リターン処理で対応済み
- 折りたたみ状態のリリースIDがデータから削除された場合: レンダリング時に参照されないため無害（localStorageに古いキーが残るだけ）
- `lastScheduled`がnullの場合（初期化前）: トグル関数の先頭で`if (!lastScheduled) return;`で早期リターン

---

## PNG・HTML出力への影響

- `buildViewerHTML()`はSVGの`innerHTML`をそのまま使用するため、折りたたまれた状態がそのまま出力に反映される（意図通り）
- PNG出力（`html2canvas`）も同様

---

## テスト方針

既存のE2Eテスト（Playwright）に以下を追加：

- リリース行クリックで配下の行が非表示になること
- アイテム行クリックで工程行のみ非表示になること
- 「全折りたたみ」でリリース行以外が非表示になること
- 「全展開」で全行が表示されること
- リロード後に折りたたみ状態が復元されること（localStorageテスト）
