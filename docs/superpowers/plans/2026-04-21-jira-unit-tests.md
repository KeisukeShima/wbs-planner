# JIRA連携 単体テスト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wbs-planner.html` のJIRA連携ロジックを本番JIRAを一切触らずに単体テストでカバーする。

**Architecture:** `tests/lib/core.js` と同じパターンで、HTMLから純粋関数を `tests/lib/jira.js` に抽出・パラメータ化し、`tests/unit/jira.test.js` でVitestにより検証する。HTMLは変更しない。fetchは `vi.stubGlobal` でモックする。

**Tech Stack:** Vitest 2.x / Node.js 18+（btoa・fetch組み込み）

---

## ファイル変更マップ

| ファイル | 種別 | 内容 |
| --- | --- | --- |
| `tests/lib/jira.js` | 新規 | HTMLから抽出した純粋関数・パラメータ化関数 |
| `tests/unit/jira.test.js` | 新規 | 上記の全テスト |

---

## Task 1: 純粋ヘルパー関数 — `makeADF` / `cfSchemaKind` / `cfPayloadValue`

**Files:**

- Create: `tests/lib/jira.js`
- Create: `tests/unit/jira.test.js`

- [ ] **Step 1: `tests/unit/jira.test.js` を作成してテストを書く（失敗する）**

```javascript
/**
 * Unit tests for JIRA integration helpers.
 * Keep in sync with the corresponding implementations in wbs-planner.html.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
} from '../lib/jira.js';

// ─── makeADF ─────────────────────────────────────────────────────────────────

describe('makeADF', () => {
  it('returns undefined for null', () => {
    expect(makeADF(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(makeADF('')).toBeUndefined();
  });

  it('returns undefined for newline-only string', () => {
    expect(makeADF('\n\n')).toBeUndefined();
  });

  it('wraps single-line text in a paragraph with one text node', () => {
    const result = makeADF('Hello');
    expect(result.type).toBe('doc');
    expect(result.version).toBe(1);
    const para = result.content[0];
    expect(para.type).toBe('paragraph');
    expect(para.content).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('separates multiple lines with hardBreak nodes', () => {
    const result = makeADF('Line1\nLine2\nLine3');
    const content = result.content[0].content;
    expect(content).toEqual([
      { type: 'text', text: 'Line1' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Line2' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Line3' },
    ]);
  });
});

// ─── cfSchemaKind ─────────────────────────────────────────────────────────────

describe('cfSchemaKind', () => {
  it('returns "string" for null', () => {
    expect(cfSchemaKind(null)).toBe('string');
  });

  it('returns "string" for undefined', () => {
    expect(cfSchemaKind(undefined)).toBe('string');
  });

  it('returns "option" for { type: "option" }', () => {
    expect(cfSchemaKind({ type: 'option' })).toBe('option');
  });

  it('returns "user" for { type: "user" }', () => {
    expect(cfSchemaKind({ type: 'user' })).toBe('user');
  });

  it('returns "user_array" for { type: "array", items: "user" }', () => {
    expect(cfSchemaKind({ type: 'array', items: 'user' })).toBe('user_array');
  });

  it('returns "option_array" for { type: "array", items: "option" }', () => {
    expect(cfSchemaKind({ type: 'array', items: 'option' })).toBe('option_array');
  });

  it('returns "string" for { type: "string" }', () => {
    expect(cfSchemaKind({ type: 'string' })).toBe('string');
  });

  it('returns "raw" for unknown type such as "datetime"', () => {
    expect(cfSchemaKind({ type: 'datetime' })).toBe('raw');
  });
});

// ─── cfPayloadValue ──────────────────────────────────────────────────────────

describe('cfPayloadValue', () => {
  it('returns undefined for null value', () => {
    expect(cfPayloadValue({ schema: null, value: null })).toBeUndefined();
  });

  it('returns undefined for undefined value', () => {
    expect(cfPayloadValue({ schema: null, value: undefined })).toBeUndefined();
  });

  it('returns undefined for empty string value', () => {
    expect(cfPayloadValue({ schema: null, value: '' })).toBeUndefined();
  });

  it('wraps option value as { id }', () => {
    expect(cfPayloadValue({ schema: { type: 'option' }, value: '10001' }))
      .toEqual({ id: '10001' });
  });

  it('wraps user value as { accountId }', () => {
    expect(cfPayloadValue({ schema: { type: 'user' }, value: 'abc123' }))
      .toEqual({ accountId: 'abc123' });
  });

  it('wraps user_array value as [{ accountId }]', () => {
    expect(cfPayloadValue({ schema: { type: 'array', items: 'user' }, value: 'abc123' }))
      .toEqual([{ accountId: 'abc123' }]);
  });

  it('wraps option_array value as [{ id }]', () => {
    expect(cfPayloadValue({ schema: { type: 'array', items: 'option' }, value: '10001' }))
      .toEqual([{ id: '10001' }]);
  });

  it('parses a valid JSON string for raw kind', () => {
    expect(cfPayloadValue({ schema: { type: 'datetime' }, value: '{"key":"val"}' }))
      .toEqual({ key: 'val' });
  });

  it('returns the raw string as-is when JSON parse fails', () => {
    expect(cfPayloadValue({ schema: { type: 'datetime' }, value: 'not-json' }))
      .toBe('not-json');
  });

  it('returns string value as-is for kind=string', () => {
    expect(cfPayloadValue({ schema: { type: 'string' }, value: 'hello' }))
      .toBe('hello');
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `Cannot find module '../lib/jira.js'` または同等のエラーで失敗。

- [ ] **Step 3: `tests/lib/jira.js` を作成して3関数を実装する**

```javascript
/**
 * Pure functions extracted from wbs-planner.html for unit testing.
 * Keep in sync with the corresponding implementations in wbs-planner.html.
 */

// ─── makeADF (wbs-planner.html:2104) ─────────────────────────────────────────

export function makeADF(text) {
  if (!text) return undefined;
  const lines = String(text).split('\n').filter(l => l.length > 0);
  if (!lines.length) return undefined;
  const inlines = [];
  lines.forEach((line, i) => {
    if (i > 0) inlines.push({ type: 'hardBreak' });
    inlines.push({ type: 'text', text: line });
  });
  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: inlines }] };
}

// ─── cfSchemaKind (wbs-planner.html:1854) ────────────────────────────────────

export function cfSchemaKind(schema) {
  if (!schema) return 'string';
  if (schema.type === 'option') return 'option';
  if (schema.type === 'user')   return 'user';
  if (schema.type === 'array' && schema.items === 'user')   return 'user_array';
  if (schema.type === 'array' && schema.items === 'option') return 'option_array';
  if (schema.type === 'string') return 'string';
  return 'raw';
}

// ─── cfPayloadValue (wbs-planner.html:1864) ──────────────────────────────────

export function cfPayloadValue(field) {
  const v = field.value;
  if (v === null || v === undefined || v === '') return undefined;
  const kind = cfSchemaKind(field.schema);
  if (kind === 'option')       return { id: v };
  if (kind === 'user')         return { accountId: v };
  if (kind === 'user_array')   return [{ accountId: v }];
  if (kind === 'option_array') return [{ id: v }];
  if (kind === 'raw') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
```

- [ ] **Step 4: テストを実行してすべてパスすることを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `makeADF (5)`, `cfSchemaKind (8)`, `cfPayloadValue (10)` の全テストがPASS。

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "test: add unit tests for makeADF, cfSchemaKind, cfPayloadValue"
```

---

## Task 2: `getAccountId` と `buildTaskBody`

**Files:**

- Modify: `tests/lib/jira.js`（末尾に追記）
- Modify: `tests/unit/jira.test.js`（末尾に追記）

- [ ] **Step 1: `tests/unit/jira.test.js` の import に `getAccountId` と `buildTaskBody` を追加し、テストを追記する**

importを以下に変更する:

```javascript
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
  getAccountId,
  buildTaskBody,
} from '../lib/jira.js';
```

ファイル末尾に以下のテストブロックを追記する:

```javascript
// ─── getAccountId ─────────────────────────────────────────────────────────────

describe('getAccountId', () => {
  const people = [
    { name: 'Alice', jiraUser: 'alice-account-id' },
    { name: 'Bob',   jiraUser: '' },
    { name: 'Charlie', jiraUser: null },
  ];

  it('returns the accountId when person is found with jiraUser set', () => {
    expect(getAccountId('Alice', people)).toBe('alice-account-id');
  });

  it('returns null when person name is not in the list', () => {
    expect(getAccountId('Dave', people)).toBeNull();
  });

  it('returns null when jiraUser is empty string', () => {
    expect(getAccountId('Bob', people)).toBeNull();
  });

  it('returns null when jiraUser is null', () => {
    expect(getAccountId('Charlie', people)).toBeNull();
  });
});

// ─── buildTaskBody ────────────────────────────────────────────────────────────

const baseJC = { projectKey: 'PROJ', issueTypeName: 'Task', customFields: [] };
const basePeople = [
  { name: 'Alice', jiraUser: 'alice-id' },
  { name: 'Bob',   jiraUser: '' },
];
const baseRelease    = { epicKey: '' };
const baseItem       = { name: 'Feature A', category: '', note: '' };
const basePhaseTask  = { isBackground: false, totalDays: 5, assignedPeople: ['Alice'] };

describe('buildTaskBody', () => {
  it('includes project, summary, issuetype, and description', () => {
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], baseRelease, baseJC, basePeople);
    expect(body.fields.project).toEqual({ key: 'PROJ' });
    expect(body.fields.summary).toBe('1 Feature A');
    expect(body.fields.issuetype).toEqual({ name: 'Task' });
    expect(body.fields.description).toBeDefined();
  });

  it('uses itemIndex+1 as the number prefix in summary', () => {
    const body = buildTaskBody(baseItem, 2, [basePhaseTask], baseRelease, baseJC, basePeople);
    expect(body.fields.summary).toBe('3 Feature A');
  });

  it('sets customfield_10014 when release has epicKey', () => {
    const release = { epicKey: 'PROJ-10' };
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], release, baseJC, basePeople);
    expect(body.fields.customfield_10014).toBe('PROJ-10');
  });

  it('omits customfield_10014 when epicKey is empty', () => {
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], baseRelease, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('customfield_10014');
  });

  it('sets assignee when the first non-background phase has a mapped person', () => {
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], baseRelease, baseJC, basePeople);
    expect(body.fields.assignee).toEqual({ accountId: 'alice-id' });
  });

  it('omits assignee when the person has no jiraUser mapping', () => {
    const tasks = [{ ...basePhaseTask, assignedPeople: ['Bob'] }];
    const body = buildTaskBody(baseItem, 0, tasks, baseRelease, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('assignee');
  });

  it('merges custom fields that have non-empty values', () => {
    const jc = {
      ...baseJC,
      customFields: [{ id: 'customfield_123', schema: { type: 'string' }, value: 'myval' }],
    };
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], baseRelease, jc, basePeople);
    expect(body.fields.customfield_123).toBe('myval');
  });

  it('omits custom fields with empty values', () => {
    const jc = {
      ...baseJC,
      customFields: [{ id: 'customfield_123', schema: { type: 'string' }, value: '' }],
    };
    const body = buildTaskBody(baseItem, 0, [basePhaseTask], baseRelease, jc, basePeople);
    expect(body.fields).not.toHaveProperty('customfield_123');
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `getAccountId` と `buildTaskBody` のテストが `is not a function` で失敗。既存テストはPASS。

- [ ] **Step 3: `tests/lib/jira.js` に `getAccountId` と `buildTaskBody` を追記する**

`tests/lib/jira.js` の末尾に追記する:

```javascript
// ─── getAccountId (wbs-planner.html:2116) ────────────────────────────────────

export function getAccountId(personName, people) {
  const p = people.find(x => x.name === personName);
  return (p && p.jiraUser) ? p.jiraUser : null;
}

// ─── buildTaskBody (wbs-planner.html:2179-2203) ──────────────────────────────
// Extracted from pushToJira(). jc = JiraConfig, people = C.people

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

  return { fields: {
    project:     { key: jc.projectKey },
    summary:     taskSummary,
    issuetype:   { name: jc.issueTypeName || 'Task' },
    description: makeADF(taskDesc),
    ...(release.epicKey   ? { customfield_10014: release.epicKey }          : {}),
    ...(taskAccountId     ? { assignee: { accountId: taskAccountId } }      : {}),
    ...extraFields,
  }};
}
```

- [ ] **Step 4: テストを実行してすべてパスすることを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: これまでの全テスト（`getAccountId (4)`, `buildTaskBody (8)` を含む）がPASS。

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "test: add unit tests for getAccountId and buildTaskBody"
```

---

## Task 3: `buildSubTaskBody`

**Files:**

- Modify: `tests/lib/jira.js`（末尾に追記）
- Modify: `tests/unit/jira.test.js`（末尾に追記）

- [ ] **Step 1: `tests/unit/jira.test.js` の import に `buildSubTaskBody` を追加し、テストを追記する**

importを以下に変更する:

```javascript
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
  getAccountId,
  buildTaskBody,
  buildSubTaskBody,
} from '../lib/jira.js';
```

ファイル末尾に以下のテストブロックを追記する:

```javascript
// ─── buildSubTaskBody ─────────────────────────────────────────────────────────

const baseSubTask = {
  wbsNo:          '1.1',
  phaseType:      '開発',
  itemName:       'Feature A',
  isBackground:   false,
  assignedPeople: ['Alice'],
  requireAll:     false,
  totalDays:      3,
};
const basePhaseTypeObj = { name: '開発', team: '開発チーム' };

describe('buildSubTaskBody', () => {
  it('includes project, parent, issuetype=Sub-task, summary, description', () => {
    const body = buildSubTaskBody(baseSubTask, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields.project).toEqual({ key: 'PROJ' });
    expect(body.fields.parent).toEqual({ key: 'PROJ-1' });
    expect(body.fields.issuetype).toEqual({ name: 'Sub-task' });
    expect(body.fields.summary).toBe('1.1 開発 — Feature A');
  });

  it('sets assignee when the assigned person has a jiraUser mapping', () => {
    const body = buildSubTaskBody(baseSubTask, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields.assignee).toEqual({ accountId: 'alice-id' });
  });

  it('omits assignee for background tasks even when assignedPeople is set', () => {
    const task = { ...baseSubTask, isBackground: true };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('assignee');
  });

  it('includes バックグラウンドタスク in description for background tasks', () => {
    const task = { ...baseSubTask, isBackground: true };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText   = textNodes.map(n => n.text).join('');
    expect(allText).toContain('バックグラウンドタスク');
  });

  it('includes all assignee names in description when requireAll=true and multiple people', () => {
    const people = [
      { name: 'Alice', jiraUser: 'alice-id' },
      { name: 'Bob',   jiraUser: 'bob-id' },
    ];
    const task = { ...baseSubTask, requireAll: true, assignedPeople: ['Alice', 'Bob'] };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, people);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText   = textNodes.map(n => n.text).join('');
    expect(allText).toContain('Alice');
    expect(allText).toContain('Bob');
  });

  it('omits 全担当者 line when requireAll=false', () => {
    const task = { ...baseSubTask, requireAll: false, assignedPeople: ['Alice', 'Bob'] };
    const body = buildSubTaskBody(task, 'PROJ-1', basePhaseTypeObj, baseJC, basePeople);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText   = textNodes.map(n => n.text).join('');
    expect(allText).not.toContain('全担当者');
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `buildSubTaskBody` のテストが `is not a function` で失敗。既存テストはPASS。

- [ ] **Step 3: `tests/lib/jira.js` に `buildSubTaskBody` を追記する**

`tests/lib/jira.js` の末尾に追記する:

```javascript
// ─── buildSubTaskBody (wbs-planner.html:2217-2248) ───────────────────────────
// phaseType: { name, team } object resolved from C.phaseTypes, or null.

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
    ...(subAccountId ? { assignee: { accountId: subAccountId } } : {}),
  }};
}
```

- [ ] **Step 4: テストを実行してすべてパスすることを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `buildSubTaskBody (6)` を含む全テストがPASS。

- [ ] **Step 5: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "test: add unit tests for buildSubTaskBody"
```

---

## Task 4: `jiraApiWith`（fetchモック）

**Files:**

- Modify: `tests/lib/jira.js`（末尾に追記）
- Modify: `tests/unit/jira.test.js`（末尾に追記）

- [ ] **Step 1: `tests/unit/jira.test.js` の import に `jiraApiWith` を追加し、テストを追記する**

importを以下に変更する:

```javascript
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
  getAccountId,
  buildTaskBody,
  buildSubTaskBody,
  jiraApiWith,
} from '../lib/jira.js';
```

ファイル末尾に以下のテストブロックを追記する:

```javascript
// ─── jiraApiWith ──────────────────────────────────────────────────────────────

describe('jiraApiWith', () => {
  const validJC = {
    siteUrl:      'https://mycompany.atlassian.net',
    email:        'user@example.com',
    apiToken:     'secret-token',
    projectKey:   'PROJ',
    proxyUrl:     '',
    customFields: [],
  };

  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when siteUrl is empty', async () => {
    const jc = { ...validJC, siteUrl: '' };
    await expect(jiraApiWith('/myself', {}, jc)).rejects.toThrow('接続設定が未入力です');
  });

  it('throws when email is empty', async () => {
    const jc = { ...validJC, email: '' };
    await expect(jiraApiWith('/myself', {}, jc)).rejects.toThrow('接続設定が未入力です');
  });

  it('throws when apiToken is empty', async () => {
    const jc = { ...validJC, apiToken: '' };
    await expect(jiraApiWith('/myself', {}, jc)).rejects.toThrow('接続設定が未入力です');
  });

  it('resolves with parsed JSON on a 200 response', async () => {
    const mockData = { displayName: 'Test User' };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const result = await jiraApiWith('/myself', {}, validJC);
    expect(result).toEqual(mockData);
  });

  it('calls the direct JIRA URL when proxyUrl is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await jiraApiWith('/myself', {}, validJC);
    expect(mockFetch.mock.calls[0][0])
      .toBe('https://mycompany.atlassian.net/rest/api/3/myself');
  });

  it('uses proxy URL and sets X-Jira-Site header when proxyUrl is configured', async () => {
    const jc = { ...validJC, proxyUrl: 'http://localhost:8001' };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await jiraApiWith('/myself', {}, jc);
    const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:8001/rest/api/3/myself');
    expect(calledOpts.headers['X-Jira-Site'])
      .toBe('https://mycompany.atlassian.net');
  });

  it('throws "HTTP 401" when response status is 401 and body is unreadable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401,
      json: async () => { throw new Error('no body'); },
    });
    await expect(jiraApiWith('/myself', {}, validJC)).rejects.toThrow('HTTP 401');
  });

  it('throws with JIRA errorMessages when the error response contains them', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ errorMessages: ['Project does not exist'] }),
    });
    await expect(jiraApiWith('/issue', {}, validJC))
      .rejects.toThrow('Project does not exist');
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `jiraApiWith` のテストが `is not a function` で失敗。既存テストはPASS。

- [ ] **Step 3: `tests/lib/jira.js` に `jiraApiWith` を追記する**

`tests/lib/jira.js` の末尾に追記する:

```javascript
// ─── jiraApiWith (wbs-planner.html:1793) ─────────────────────────────────────
// Parameterised version of jiraApi(): accepts jc instead of reading global JC.
// fetch is the global — stub it with vi.stubGlobal('fetch', vi.fn()) in tests.

export async function jiraApiWith(path, opts = {}, jc) {
  if (!jc.siteUrl || !jc.email || !jc.apiToken) throw new Error('接続設定が未入力です');
  const base = jc.siteUrl.replace(/\/$/, '');
  const auth = btoa(`${jc.email}:${jc.apiToken}`);

  let url, extraHeaders = {};
  if (jc.proxyUrl) {
    url = `${jc.proxyUrl.replace(/\/$/, '')}/rest/api/3${path}`;
    extraHeaders['X-Jira-Site'] = base;
  } else {
    url = `${base}/rest/api/3${path}`;
  }

  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...extraHeaders,
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      const parts = [];
      if (j.errorMessages?.length) parts.push(...j.errorMessages);
      if (j.errors) parts.push(...Object.entries(j.errors).map(([k, v]) => `${k}: ${v}`));
      if (j.message) parts.push(j.message);
      if (parts.length) msg = parts.join(' / ');
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
```

- [ ] **Step 4: テストを実行してすべてパスすることを確認する**

```bash
npx vitest run tests/unit/jira.test.js
```

期待値: `jiraApiWith (8)` を含む全テストがPASS。

- [ ] **Step 5: テストスイート全体を実行して既存テストへのデグレがないことを確認する**

```bash
npm test
```

期待値: 全テストスイートのすべてのテストがPASS。

- [ ] **Step 6: コミット**

```bash
git add tests/lib/jira.js tests/unit/jira.test.js
git commit -m "test: add unit tests for jiraApiWith with fetch mocking"
```
