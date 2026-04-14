# WBS番号付番 + JIRA CSVエクスポート Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gantt-generator.html` に WBS 番号自動付番と JIRA CSV エクスポート機能を追加する。

**Architecture:** 単一 HTML ファイルに全変更を加える。データモデル（DEFAULT_CONFIG）→ スケジューラ（runSchedule）→ 描画（renderGantt / renderTable）→ UI→ CSV生成の順に実装し、各タスク後にブラウザで動作確認してコミットする。自動テストフレームワークは存在しないため「ブラウザで確認して commit」をテストサイクルとする。

**Tech Stack:** Vanilla JS / SVG / HTML / CSS（単一ファイル）

---

## ファイル変更マップ

変更対象は `gantt-generator.html` のみ。以下のセクションを順番に修正する。

| セクション | 行（概算） | 変更内容 |
| ---- | ---- | ---- |
| `DEFAULT_CONFIG` | 246–276 | `epicKey: ''` 追加、people の各オブジェクトに `jiraUser: ''` 追加 |
| HTML: プロジェクト設定タブ | 158–161 | Epic キー入力欄追加 |
| HTML: フッターボタン | 189–191 | JIRA CSV ボタン追加 |
| `runSchedule()` | 344–365 | 各タスクに `wbsNo` フィールド追加 |
| `renderGantt()` | 614, 620 | 行ラベルに WBS 番号表示 |
| `renderTable()` | 687, 692 | アイテム/工程セルに WBS 番号表示 |
| `initProjectForm()` + イベント | 751–765 | epicKey フィールドの初期化・変更ハンドラ |
| `renderPeopleList()` + `btn-add-person` | 915, 945 | jiraUser フィールドの UI・ハンドラ |
| 新規: `generateJiraCSV()` | 1155 の直前 | CSV 生成関数追加 |
| 新規: `btn-jira-csv` ハンドラ | generateJiraCSV の直後 | クリックハンドラ |

---

## Task 1: データモデルに epicKey と jiraUser を追加

**Files:**
- Modify: `gantt-generator.html:246–276`（DEFAULT_CONFIG セクション）
- Modify: `gantt-generator.html:944–946`（btn-add-person ハンドラ）

- [ ] **Step 1: DEFAULT_CONFIG に epicKey を追加**

`gantt-generator.html` の `evalPhase` の直前に追加する。

変更前:
```javascript
  evalPhase: { name: 'リリース評価', color: '#8B5CF6' },
};
```

変更後:
```javascript
  epicKey:   '',
  evalPhase: { name: 'リリース評価', color: '#8B5CF6' },
};
```

- [ ] **Step 2: DEFAULT_CONFIG の people に jiraUser を追加**

変更前:
```javascript
  people: [
    { name: '担当者A', team: 'チーム1', phases: ['要件定義','テストケース作成'], availableFrom: null, utilization: 1.0, note: '' },
    { name: '担当者B', team: 'チーム2', phases: ['設計開発'], availableFrom: null, utilization: 1.0, note: '' },
  ],
```

変更後:
```javascript
  people: [
    { name: '担当者A', team: 'チーム1', phases: ['要件定義','テストケース作成'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' },
    { name: '担当者B', team: 'チーム2', phases: ['設計開発'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' },
  ],
```

- [ ] **Step 3: btn-add-person ハンドラに jiraUser を追加**

変更前:
```javascript
document.getElementById('btn-add-person').addEventListener('click', () => {
  C.people.push({ name:'新規担当者', team:'', phases:[], availableFrom:null, utilization:1.0, note:'' });
```

変更後:
```javascript
document.getElementById('btn-add-person').addEventListener('click', () => {
  C.people.push({ name:'新規担当者', team:'', phases:[], availableFrom:null, utilization:1.0, note:'', jiraUser:'' });
```

- [ ] **Step 4: ブラウザで確認**

`gantt-generator.html` をブラウザで開き、コンソールに `C.epicKey` と `C.people[0].jiraUser` を入力して `""` が返ることを確認する。

- [ ] **Step 5: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: add epicKey and jiraUser to data model"
```

---

## Task 2: HTML UI — Epic キーフィールド + JIRA CSV ボタン

**Files:**
- Modify: `gantt-generator.html:158–161`（プロジェクト設定タブ内）
- Modify: `gantt-generator.html:189–191`（フッターボタン）

- [ ] **Step 1: プロジェクト設定タブに Epic キーフィールドを追加**

`<hr class="divider">` の直前（ガントチャート表示単位の `</div>` の直後）に追加する。

変更前:
```html
      </div>

      <hr class="divider">

      <div class="sec-title">
        <span>祝日（国民の祝日）</span>
```

変更後:
```html
      </div>
      <div class="fg">
        <label>JIRA Epic キー</label>
        <input type="text" id="f-epic-key" placeholder="例: PROJ-1">
      </div>

      <hr class="divider">

      <div class="sec-title">
        <span>祝日（国民の祝日）</span>
```

- [ ] **Step 2: フッターに JIRA CSV ボタンを追加**

変更前:
```html
    <button class="btn btn-primary" id="btn-html">HTML 出力</button>
    <button class="btn btn-secondary" id="btn-png">PNG 出力</button>
    <button class="btn btn-secondary" id="btn-json-save">JSON 保存</button>
```

変更後:
```html
    <button class="btn btn-primary" id="btn-html">HTML 出力</button>
    <button class="btn btn-secondary" id="btn-png">PNG 出力</button>
    <button class="btn btn-secondary" id="btn-jira-csv">JIRA CSV</button>
    <button class="btn btn-secondary" id="btn-json-save">JSON 保存</button>
```

- [ ] **Step 3: ブラウザで確認**

ブラウザで開き、プロジェクト設定タブに「JIRA Epic キー」欄が表示されること、フッターに「JIRA CSV」ボタンが表示されることを確認する（まだ動作しなくて良い）。

- [ ] **Step 4: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: add Epic Key field and JIRA CSV button to UI"
```

---

## Task 3: initProjectForm と epicKey イベントハンドラ

**Files:**
- Modify: `gantt-generator.html:751–765`（initProjectForm + project イベントハンドラ群）

- [ ] **Step 1: initProjectForm に epicKey の初期化を追加**

変更前:
```javascript
function initProjectForm() {
  document.getElementById('f-name').value     = C.projectName;
  document.getElementById('f-start').value    = C.startDate;
  document.getElementById('f-release').value  = C.releaseDate;
  document.getElementById('f-eval-val').value = C.evalPeriod.value;
  document.getElementById('f-eval-unit').value= C.evalPeriod.unit;
  document.querySelector(`input[name="ganttUnit"][value="${C.ganttUnit}"]`).checked = true;
}
```

変更後:
```javascript
function initProjectForm() {
  document.getElementById('f-name').value     = C.projectName;
  document.getElementById('f-start').value    = C.startDate;
  document.getElementById('f-release').value  = C.releaseDate;
  document.getElementById('f-eval-val').value = C.evalPeriod.value;
  document.getElementById('f-eval-unit').value= C.evalPeriod.unit;
  document.querySelector(`input[name="ganttUnit"][value="${C.ganttUnit}"]`).checked = true;
  document.getElementById('f-epic-key').value = C.epicKey || '';
}
```

- [ ] **Step 2: epicKey の変更イベントハンドラを追加**

`document.querySelectorAll('input[name="ganttUnit"]')` のイベントハンドラ登録の直後に追加する。

変更前:
```javascript
document.querySelectorAll('input[name="ganttUnit"]').forEach(r =>
  r.addEventListener('change', e => { if(e.target.checked){ C.ganttUnit = e.target.value; render(); } }));

// ═══════════════════════════════════════════════════════════
//  EDITOR — HOLIDAYS
```

変更後:
```javascript
document.querySelectorAll('input[name="ganttUnit"]').forEach(r =>
  r.addEventListener('change', e => { if(e.target.checked){ C.ganttUnit = e.target.value; render(); } }));
document.getElementById('f-epic-key').addEventListener('input', e => { C.epicKey = e.target.value; saveConfig(); });

// ═══════════════════════════════════════════════════════════
//  EDITOR — HOLIDAYS
```

- [ ] **Step 3: ブラウザで確認**

ブラウザで開いてプロジェクト設定タブの「JIRA Epic キー」に `PROJ-1` と入力し、コンソールで `C.epicKey` が `"PROJ-1"` になることを確認する。ページをリロードしても値が保持されることも確認する。

- [ ] **Step 4: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: wire up epicKey field in project settings"
```

---

## Task 4: runSchedule に wbsNo を追加

**Files:**
- Modify: `gantt-generator.html:344–365`（tasks.push の中）

- [ ] **Step 1: tasks.push に wbsNo フィールドを追加**

変更前:
```javascript
    item.phases.forEach((phase, pIdx) => {
      tasks.push({
        id:           `${iIdx}-${pIdx}`,
        itemIdx:      iIdx,
        itemName:     item.name,
        category:     item.category || '',
        phaseType:    phase.type,
        totalDays:    phase.days,
        phaseIdx:     pIdx,
        predId:       pIdx > 0 ? `${iIdx}-${pIdx-1}` : null,
        priority:     remaining,
        isBackground: !!phase.background,
        isFixed:      !!phase.fixedStart,
        fixedStartDate: phase.fixedStart ? parse(phase.fixedStart) : null,
        allowedPeople:  phase.allowedPeople || null,
        requireAll:     !!phase.requireAll,
        status:       'waiting',
        startDate:    null,
        endDate:      null,
        daysWorked:   0,
        assignedPeople: [],
        hasConflict:  false,
      });
```

変更後:
```javascript
    item.phases.forEach((phase, pIdx) => {
      tasks.push({
        id:           `${iIdx}-${pIdx}`,
        itemIdx:      iIdx,
        itemName:     item.name,
        category:     item.category || '',
        phaseType:    phase.type,
        totalDays:    phase.days,
        phaseIdx:     pIdx,
        wbsNo:        `${iIdx+1}.${pIdx+1}`,
        predId:       pIdx > 0 ? `${iIdx}-${pIdx-1}` : null,
        priority:     remaining,
        isBackground: !!phase.background,
        isFixed:      !!phase.fixedStart,
        fixedStartDate: phase.fixedStart ? parse(phase.fixedStart) : null,
        allowedPeople:  phase.allowedPeople || null,
        requireAll:     !!phase.requireAll,
        status:       'waiting',
        startDate:    null,
        endDate:      null,
        daysWorked:   0,
        assignedPeople: [],
        hasConflict:  false,
      });
```

- [ ] **Step 2: ブラウザで確認**

コンソールで `runSchedule().tasks[0].wbsNo` が `"1.1"`、`runSchedule().tasks[1].wbsNo` が `"1.2"` になることを確認する。

- [ ] **Step 3: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: add wbsNo field to scheduled tasks"
```

---

## Task 5: renderGantt と renderTable に WBS 番号を表示

**Files:**
- Modify: `gantt-generator.html:614`（アイテムヘッダ行ラベル）
- Modify: `gantt-generator.html:620`（フェーズ行ラベル）
- Modify: `gantt-generator.html:687`（サマリーテーブルのアイテム行）
- Modify: `gantt-generator.html:692`（サマリーテーブルのフェーズ行）

- [ ] **Step 1: renderGantt のアイテムヘッダ行に WBS 番号を追加**

変更前:
```javascript
      g += `<text x="8" y="${ry+ROW_H/2+4}" fill="#374151" font-size="10.5" font-weight="700" font-family="sans-serif">${esc(trunc(row.item.name,26))}</text>`;
```

変更後:
```javascript
      g += `<text x="8" y="${ry+ROW_H/2+4}" fill="#374151" font-size="10.5" font-weight="700" font-family="sans-serif">${esc(row.iIdx+1)} ${esc(trunc(row.item.name,22))}</text>`;
```

- [ ] **Step 2: renderGantt のフェーズ行ラベルに WBS 番号を追加**

変更前:
```javascript
      g += `<text x="18" y="${ry+ROW_H/2+4}" fill="#9CA3AF" font-size="9.5" font-family="sans-serif">└ ${esc(t.phaseType)}</text>`;
```

変更後:
```javascript
      g += `<text x="18" y="${ry+ROW_H/2+4}" fill="#9CA3AF" font-size="9.5" font-family="sans-serif">└ ${esc(t.wbsNo)} ${esc(t.phaseType)}</text>`;
```

- [ ] **Step 3: renderTable のアイテム行に WBS 番号を追加**

変更前:
```javascript
      h += `<tr class="irow"><td colspan="5">${esc(t.itemName)}${t.category?`<span class="badge" style="background:#F3F4F6;color:#6B7280;margin-left:8px">${esc(t.category)}</span>`:''}</td></tr>`;
```

変更後:
```javascript
      h += `<tr class="irow"><td colspan="5">${t.itemIdx+1} ${esc(t.itemName)}${t.category?`<span class="badge" style="background:#F3F4F6;color:#6B7280;margin-left:8px">${esc(t.category)}</span>`:''}</td></tr>`;
```

- [ ] **Step 4: renderTable のフェーズ行に WBS 番号を追加**

変更前:
```javascript
      <td style="padding-left:22px">${esc(t.phaseType)}${t.isBackground?' <em style="color:#9CA3AF;font-size:.8em">(BG)</em>':''}</td>
```

変更後:
```javascript
      <td style="padding-left:22px">${esc(t.wbsNo)} ${esc(t.phaseType)}${t.isBackground?' <em style="color:#9CA3AF;font-size:.8em">(BG)</em>':''}</td>
```

- [ ] **Step 5: ブラウザで確認**

ブラウザで開き、ガントチャートの行ラベルが `1 コア機能A` / `└ 1.1 要件定義` の形式になっていること、サマリーテーブルも同様に番号付きになっていることを確認する。

- [ ] **Step 6: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: display WBS numbers in gantt chart and summary table"
```

---

## Task 6: 担当者フォームに jiraUser フィールドを追加

**Files:**
- Modify: `gantt-generator.html:915`（renderPeopleList の note フィールドの直後）

- [ ] **Step 1: renderPeopleList に jiraUser 入力欄を追加**

変更前:
```javascript
        <div class="fg"><label>備考</label><input type="text" value="${esc(p.note||'')}" data-pi="${i}" data-pf="note"></div>
      </div>
    </div>
  `).join('');
```

変更後:
```javascript
        <div class="fg"><label>備考</label><input type="text" value="${esc(p.note||'')}" data-pi="${i}" data-pf="note"></div>
        <div class="fg"><label>JIRA ユーザー名</label><input type="text" value="${esc(p.jiraUser||'')}" data-pi="${i}" data-pf="jiraUser" placeholder="例: alice@example.com"></div>
      </div>
    </div>
  `).join('');
```

`jiraUser` は文字列フィールドなので、既存の `[data-pf]` イベントハンドラがそのまま処理する（`utilization` と `availableFrom` の特殊処理には該当しないため追加対応不要）。

- [ ] **Step 2: ブラウザで確認**

担当者タブを開き、各担当者の編集フォームに「JIRA ユーザー名」欄が表示されること、値を入力してコンソールで `C.people[0].jiraUser` が更新されることを確認する。

- [ ] **Step 3: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: add jiraUser field to people editor"
```

---

## Task 7: generateJiraCSV 関数と btn-jira-csv ハンドラ

**Files:**
- Modify: `gantt-generator.html:1155`（PNG エクスポートハンドラの直前に追加）

- [ ] **Step 1: generateJiraCSV 関数を追加**

`// ── PNG エクスポート ──` コメントの直前に以下を追加する。

```javascript
// ── JIRA CSV エクスポート ──
function generateJiraCSV() {
  let scheduled;
  try { scheduled = runSchedule(); } catch(e) { alert('スケジューリングエラー: ' + e.message); return; }
  const { tasks } = scheduled;

  const jiraUser = name => {
    const p = C.people.find(x => x.name === name);
    return p ? (p.jiraUser || p.name) : name;
  };

  const COLS = ['Issue Type','Summary','Epic Link','Parent','Assignee',
                'Start Date','Due Date','Story Points','Description','Labels'];
  const rows = [COLS];

  const itemGroups = {};
  tasks.forEach(t => { if (!itemGroups[t.itemIdx]) itemGroups[t.itemIdx] = []; itemGroups[t.itemIdx].push(t); });

  C.items.forEach((item, iIdx) => {
    const phaseTasks = itemGroups[iIdx] || [];
    const wbsItem    = `${iIdx + 1}`;
    const taskSummary = `${wbsItem} ${item.name}`;

    const starts = phaseTasks.filter(t => t.startDate).map(t => t.startDate);
    const ends   = phaseTasks.filter(t => t.endDate).map(t => t.endDate);
    const taskStart  = starts.length ? fmt(starts.reduce((a,b) => a < b ? a : b)) : '';
    const taskEnd    = ends.length   ? fmt(ends.reduce((a,b)   => a > b ? a : b)) : '';
    const totalDays  = phaseTasks.reduce((s, t) => s + t.totalDays, 0);
    const firstPhase = phaseTasks.find(t => !t.isBackground && t.assignedPeople.length > 0);
    const taskAssignee = firstPhase ? jiraUser(firstPhase.assignedPeople[0]) : '';
    const taskDesc   = [
      item.category ? `カテゴリ: ${item.category}` : '',
      item.note     ? `メモ: ${item.note}`         : '',
    ].filter(Boolean).join('\n');

    rows.push(['Task', taskSummary, C.epicKey||'', '', taskAssignee,
               taskStart, taskEnd, totalDays, taskDesc, item.category||'']);

    phaseTasks.forEach(t => {
      const pt = C.phaseTypes.find(x => x.name === t.phaseType);
      let assignee = '';
      if (!t.isBackground) {
        assignee = t.requireAll
          ? t.assignedPeople.map(n => jiraUser(n)).join(',')
          : (t.assignedPeople.length ? jiraUser(t.assignedPeople[0]) : '');
      }
      const subDesc = [
        pt ? `担当チーム: ${pt.team}` : '',
        `稼働日数: ${t.totalDays}日`,
        t.isBackground ? '（バックグラウンドタスク）' : '',
      ].filter(Boolean).join('\n');

      rows.push(['Sub-task', `${t.wbsNo} ${t.phaseType} — ${t.itemName}`,
                 '', taskSummary, assignee,
                 t.startDate ? fmt(t.startDate) : '',
                 t.endDate   ? fmt(t.endDate)   : '',
                 t.totalDays, subDesc, pt ? pt.team : '']);
    });
  });

  const csvStr = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',')
  ).join('\r\n');

  dl(new Blob(['\uFEFF' + csvStr], { type:'text/csv;charset=utf-8;' }),
     `${C.projectName||'gantt'}.csv`, 'text/csv');
}

document.getElementById('btn-jira-csv').addEventListener('click', () => {
  if (!C.epicKey) {
    if (!confirm('Epic キーが未設定です。このまま続行しますか？\n（Epic Link 列が空になります）')) return;
  }
  generateJiraCSV();
});

```

- [ ] **Step 2: ブラウザで確認（基本動作）**

1. `gantt-generator.html` を開き、サンプル設定（`examples/sample-config.json` の内容）を JSON 読込で反映する。
2. プロジェクト設定タブで Epic キーに `SAMPLE-1` を入力する。
3. 「JIRA CSV」ボタンをクリックする。
4. CSV ファイルがダウンロードされ、Excel や テキストエディタで開いて以下を確認する:
   - 1行目がヘッダ（`Issue Type,Summary,...`）
   - Task 行と Sub-task 行がインターリーブで並んでいる
   - `1 コア機能A` のような WBS 番号付きの Summary
   - `1.1 要件定義 — コア機能A` のような Sub-task の Summary
   - Epic Link 列に `SAMPLE-1`
   - Parent 列の Sub-task 行が対応する Task の Summary と一致している

- [ ] **Step 3: ブラウザで確認（epicKey 未設定）**

1. Epic キーを空欄にして「JIRA CSV」をクリックする。
2. `confirm` ダイアログが表示されることを確認する。
3. 「キャンセル」でダウンロードが中止されることを確認する。
4. 「OK」でダウンロードされ、Epic Link 列が空であることを確認する。

- [ ] **Step 4: ブラウザで確認（background タスク）**

サンプル設定の「オプション機能D」は `background: true` のフェーズを持つ。CSV でその Sub-task 行の Assignee が空欄で、Description に `（バックグラウンドタスク）` が含まれることを確認する。

- [ ] **Step 5: ブラウザで確認（requireAll タスク）**

サンプル設定の「機能E（2名同時開発）」は `requireAll: true`。CSV でその Sub-task の Assignee 列に `Dave,Eve`（または jiraUser 設定値）がカンマ区切りで入ることを確認する。

- [ ] **Step 6: コミット**

```bash
git add gantt-generator.html
git commit -m "feat: add JIRA CSV export with WBS-numbered summaries"
```

---

## Task 8: README スクリーンショットの更新

**Files:**
- Run: `node scripts/screenshot.mjs`
- Modify: `screenshots/gantt-chart.png`

WBS 番号がガントチャートに表示されるようになったので README 用スクショを再生成する。

- [ ] **Step 1: スクリーンショットを再生成**

```bash
node scripts/screenshot.mjs
```

期待出力: `✅ screenshots/gantt-chart.png を生成しました`

- [ ] **Step 2: 画像を確認**

生成された `screenshots/gantt-chart.png` を開き、ガントチャートの行ラベルに `1 コア機能A` / `└ 1.1 要件定義` の形式で WBS 番号が表示されていること、サマリーテーブルも同様であることを確認する。

- [ ] **Step 3: コミット**

```bash
git add screenshots/gantt-chart.png
git commit -m "chore: update README screenshot with WBS numbers"
```
