# JIRA登録時にガントチャートの日程を設定する Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JIRA登録時に、ガントチャートのスケジューラが算出した開始日・終了日を Task / Sub-task の `startDate` / `duedate` フィールドへ自動設定する。

**Architecture:** `tests/lib/jira.js` のビルダー関数に日付計算を追加し、`wbs-planner.html` の `pushToJira()` の inline コードも同様に更新する。日付フォーマットは `wbs-planner.html` 既存の `fmt()` を再利用し、`tests/lib/jira.js` には `toJiraDate()` を新規エクスポートする。

**Tech Stack:** Vanilla JS (ES modules), Vitest (unit tests)

---

## File Map

| ファイル | 変更内容 |
|---|---|
| `tests/lib/jira.js` | `toJiraDate` 追加・export、`buildTaskBody` / `buildSubTaskBody` に日付フィールドを追加 |
| `tests/unit/jira.test.js` | `toJiraDate` / `buildTaskBody` / `buildSubTaskBody` の日付テストを追加 |
| `wbs-planner.html` | `pushToJira()` 内の `taskBody` / `subBody` 組み立て部分に日付フィールドを追加 |

---

## Task 1: `toJiraDate` ヘルパーを追加する

**Files:**
- Modify: `tests/lib/jira.js`
- Modify: `tests/unit/jira.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/jira.test.js` の import に `toJiraDate` を追加し、テストブロックを追加する。

```js
// tests/unit/jira.test.js の import を更新
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
  getAccountId,
  buildTaskBody,
  buildSubTaskBody,
  jiraApiWith,
  toJiraDate,   // ← 追加
} from '../lib/jira.js';
```

`describe('jiraApiWith', ...)` ブロックの前に以下を追加する：

```js
// ─── toJiraDate ───────────────────────────────────────────────────────────────

describe('toJiraDate', () => {
  it('formats a date as YYYY-MM-DD without timezone shift', () => {
    expect(toJiraDate(new Date(2026, 3, 22))).toBe('2026-04-22');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toJiraDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
cd /home/keisukeshima/Documents/wbs-planner-dev
npm test -- --reporter=verbose 2>&1 | grep -A3 "toJiraDate"
```

期待: `toJiraDate is not a function` のようなエラーで FAIL

- [ ] **Step 3: `toJiraDate` を `tests/lib/jira.js` に追加する**

`tests/lib/jira.js` の先頭（`makeADF` 定義の前）に追加する：

```js
// ─── toJiraDate ──────────────────────────────────────────────────────────────

export const toJiraDate = d =>
  [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "toJiraDate"
```

期待: 2件 PASS

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "feat: add toJiraDate helper with tests"
```

---

## Task 2: `buildTaskBody` に開始日・期限を追加する

**Files:**
- Modify: `tests/lib/jira.js:56-82`
- Modify: `tests/unit/jira.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/jira.test.js` の `describe('buildTaskBody', ...)` ブロック末尾（最後の `it(...)` の後）に追加する：

```js
  it('sets startDate and duedate from the earliest/latest dates across phaseTasks', () => {
    const tasks = [
      { ...basePhaseTask, startDate: new Date(2026, 3, 5),  endDate: new Date(2026, 3, 15) },
      { ...basePhaseTask, startDate: new Date(2026, 3, 1),  endDate: new Date(2026, 3, 20) },
    ];
    const body = buildTaskBody(baseItem, 0, tasks, baseRelease, baseJC, basePeople);
    expect(body.fields.startDate).toBe('2026-04-01');
    expect(body.fields.duedate).toBe('2026-04-20');
  });

  it('omits startDate and duedate when all phaseTasks have null dates', () => {
    const tasks = [{ ...basePhaseTask, startDate: null, endDate: null }];
    const body = buildTaskBody(baseItem, 0, tasks, baseRelease, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('startDate');
    expect(body.fields).not.toHaveProperty('duedate');
  });

  it('sets startDate only when all endDates are null', () => {
    const tasks = [{ ...basePhaseTask, startDate: new Date(2026, 3, 1), endDate: null }];
    const body = buildTaskBody(baseItem, 0, tasks, baseRelease, baseJC, basePeople);
    expect(body.fields.startDate).toBe('2026-04-01');
    expect(body.fields).not.toHaveProperty('duedate');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(startDate|duedate|FAIL|PASS)" | head -20
```

期待: 3件 FAIL（`startDate` が undefined）

- [ ] **Step 3: `buildTaskBody` を更新する**

`tests/lib/jira.js` の `buildTaskBody` 関数を以下に置き換える（`extraFields` 計算の後、`return` の前に日付計算を追加）：

```js
export function buildTaskBody(item, itemIndex, phaseTasks, release, jc, people) {
  const taskSummary   = `${itemIndex + 1} ${item.name}`;
  const totalDays     = phaseTasks.filter(t => !t.isBackground).reduce((s, t) => s + t.totalDays, 0);
  const firstPhase    = phaseTasks.find(t => !t.isBackground && t.assignedPeople.length > 0);
  const taskAccountId = firstPhase ? getAccountId(firstPhase.assignedPeople[0], people) : null;
  const taskDesc      = [
    item.category ? `カテゴリ: ${item.category}` : '',
    item.note     ? `メモ: ${item.note}`         : '',
    `稼働日数（合計）: ${totalDays}日`,
  ].filter(Boolean).join('\n');

  const extraFields = {};
  (jc.customFields || []).forEach(f => {
    const v = cfPayloadValue(f);
    if (v !== undefined) extraFields[f.id] = v;
  });

  const starts    = phaseTasks.map(t => t.startDate).filter(Boolean);
  const ends      = phaseTasks.map(t => t.endDate).filter(Boolean);
  const taskStart = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null;
  const taskEnd   = ends.length   ? new Date(Math.max(...ends.map(d => d.getTime())))   : null;

  return { fields: {
    project:     { key: jc.projectKey },
    summary:     taskSummary,
    issuetype:   { name: jc.issueTypeName || 'Task' },
    description: makeADF(taskDesc),
    ...(release.epicKey ? { customfield_10014: release.epicKey }          : {}),
    ...(taskAccountId   ? { assignee: { accountId: taskAccountId } }      : {}),
    ...(taskStart       ? { startDate: toJiraDate(taskStart) }            : {}),
    ...(taskEnd         ? { duedate:   toJiraDate(taskEnd) }              : {}),
    ...extraFields,
  }};
}
```

- [ ] **Step 4: テストが全件通ることを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

期待: 全テスト PASS（失敗ゼロ）

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "feat: set startDate/duedate on Task body from phaseTasks date range"
```

---

## Task 3: `buildSubTaskBody` に開始日・期限を追加する

**Files:**
- Modify: `tests/lib/jira.js:87-109`
- Modify: `tests/unit/jira.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/jira.test.js` の `describe('buildSubTaskBody', ...)` ブロック末尾に追加する：

```js
  it('sets startDate and duedate from task.startDate and task.endDate', () => {
    const task = { ...baseSubTask, startDate: new Date(2026, 3, 1), endDate: new Date(2026, 3, 10) };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields.startDate).toBe('2026-04-01');
    expect(body.fields.duedate).toBe('2026-04-10');
  });

  it('omits startDate when task.startDate is null', () => {
    const task = { ...baseSubTask, startDate: null, endDate: new Date(2026, 3, 10) };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('startDate');
    expect(body.fields.duedate).toBe('2026-04-10');
  });

  it('omits duedate when task.endDate is null', () => {
    const task = { ...baseSubTask, startDate: new Date(2026, 3, 1), endDate: null };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields.startDate).toBe('2026-04-01');
    expect(body.fields).not.toHaveProperty('duedate');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "buildSubTaskBody" -A 20 | head -30
```

期待: 3件 FAIL（`startDate` / `duedate` が undefined）

- [ ] **Step 3: `buildSubTaskBody` を更新する**

`tests/lib/jira.js` の `buildSubTaskBody` 関数を以下に置き換える：

```js
export function buildSubTaskBody(task, taskKey, phaseType, jc, people) {
  const subSummary = `${task.wbsNo} ${task.phaseType} — ${task.itemName}`;
  let subAccountId = null;
  if (!task.isBackground && task.assignedPeople.length > 0) {
    subAccountId = getAccountId(task.assignedPeople[0], people);
  }
  const subDesc = [
    phaseType ? `担当チーム: ${phaseType.team}` : '',
    `稼働日数: ${task.totalDays}日`,
    task.isBackground ? '（バックグラウンドタスク）' : '',
    (task.requireAll && task.assignedPeople.length > 1)
      ? `全担当者: ${task.assignedPeople.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return { fields: {
    project:     { key: jc.projectKey },
    summary:     subSummary,
    issuetype:   { name: 'Sub-task' },
    parent:      { key: taskKey },
    description: makeADF(subDesc),
    ...(subAccountId  ? { assignee:  { accountId: subAccountId } } : {}),
    ...(task.startDate ? { startDate: toJiraDate(task.startDate) } : {}),
    ...(task.endDate   ? { duedate:   toJiraDate(task.endDate) }   : {}),
  }};
}
```

- [ ] **Step 4: テストが全件通ることを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

期待: 全テスト PASS（失敗ゼロ）

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "feat: set startDate/duedate on Sub-task body from task schedule"
```

---

## Task 4: `wbs-planner.html` の `pushToJira()` を更新する

`tests/lib/jira.js` のビルダー関数は `wbs-planner.html` の `pushToJira()` 内 inline コードから抽出されたもの。HTML 側も同様に日付フィールドを追加する。`wbs-planner.html` には既に `fmt(d)` ヘルパー（`YYYY-MM-DD` 形式）があるので、それを再利用する。

**Files:**
- Modify: `wbs-planner.html` (pushToJira 内の taskBody 組み立て部分、subBody 組み立て部分)

- [ ] **Step 1: `taskBody` 組み立て部分を更新する**

`wbs-planner.html` の以下の箇所（`const extraFields = {}` の直後、`const taskBody` の直前）を探し、日付計算を追加する。

現在のコード（`wbs-planner.html` 約 2215〜2229 行）:
```js
      const extraFields = {};
      (JC.customFields || []).forEach(f => {
        const v = cfPayloadValue(f);
        if (v !== undefined) extraFields[f.id] = v;
      });

      const taskBody = { fields: {
        project:     { key: JC.projectKey },
        summary:     taskSummary,
        issuetype:   { name: JC.issueTypeName || 'Task' },
        description: makeADF(taskDesc),
        ...(release.epicKey ? { customfield_10014: release.epicKey } : {}),
        ...(taskAccountId   ? { assignee: { accountId: taskAccountId } } : {}),
        ...extraFields,
      }};
```

変更後:
```js
      const extraFields = {};
      (JC.customFields || []).forEach(f => {
        const v = cfPayloadValue(f);
        if (v !== undefined) extraFields[f.id] = v;
      });

      const _starts   = phaseTasks.map(t => t.startDate).filter(Boolean);
      const _ends     = phaseTasks.map(t => t.endDate).filter(Boolean);
      const taskStart = _starts.length ? new Date(Math.min(..._starts.map(d => d.getTime()))) : null;
      const taskEnd   = _ends.length   ? new Date(Math.max(..._ends.map(d => d.getTime())))   : null;

      const taskBody = { fields: {
        project:     { key: JC.projectKey },
        summary:     taskSummary,
        issuetype:   { name: JC.issueTypeName || 'Task' },
        description: makeADF(taskDesc),
        ...(release.epicKey ? { customfield_10014: release.epicKey }     : {}),
        ...(taskAccountId   ? { assignee: { accountId: taskAccountId } } : {}),
        ...(taskStart       ? { startDate: fmt(taskStart) }              : {}),
        ...(taskEnd         ? { duedate:   fmt(taskEnd) }                : {}),
        ...extraFields,
      }};
```

- [ ] **Step 2: `subBody` 組み立て部分を更新する**

`wbs-planner.html` の以下の箇所（`const subBody = { fields:` から始まる部分、約 2258〜2265 行）を探して更新する。

現在のコード:
```js
        const subBody = { fields: {
          project:     { key: JC.projectKey },
          summary:     subSummary,
          issuetype:   { name: 'Sub-task' },
          parent:      { key: taskKey },
          description: makeADF(subDesc),
          ...(subAccountId ? { assignee: { accountId: subAccountId } } : {}),
        }};
```

変更後:
```js
        const subBody = { fields: {
          project:     { key: JC.projectKey },
          summary:     subSummary,
          issuetype:   { name: 'Sub-task' },
          parent:      { key: taskKey },
          description: makeADF(subDesc),
          ...(subAccountId ? { assignee:  { accountId: subAccountId } } : {}),
          ...(t.startDate  ? { startDate: fmt(t.startDate) }            : {}),
          ...(t.endDate    ? { duedate:   fmt(t.endDate) }              : {}),
        }};
```

- [ ] **Step 3: ユニットテストが全件通ることを確認する**

```bash
npm test -- --reporter=verbose 2>&1 | tail -10
```

期待: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add wbs-planner.html
git commit -m "feat: set startDate/duedate in pushToJira inline code"
```
