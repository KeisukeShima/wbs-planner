/**
 * Unit tests for JIRA integration helpers.
 * Keep in sync with the corresponding implementations in wbs-planner.html.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  makeADF,
  cfSchemaKind,
  cfPayloadValue,
  getAccountId,
  buildTaskBody,
  buildSubTaskBody,
  jiraApiWith,
  toJiraDate,
} from '../lib/jira.js';

// ─── toJiraDate ───────────────────────────────────────────────────────────────

describe('toJiraDate', () => {
  it('formats a date as YYYY-MM-DD without timezone shift', () => {
    expect(toJiraDate(new Date(2026, 3, 22))).toBe('2026-04-22');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toJiraDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

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

  it('includes カテゴリ in description when item.category is set', () => {
    const item = { ...baseItem, category: '設計' };
    const body = buildTaskBody(item, 0, [basePhaseTask], baseRelease, baseJC, basePeople);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText = textNodes.map(n => n.text).join('');
    expect(allText).toContain('カテゴリ: 設計');
  });

  it('includes メモ in description when item.note is set', () => {
    const item = { ...baseItem, note: '要注意' };
    const body = buildTaskBody(item, 0, [basePhaseTask], baseRelease, baseJC, basePeople);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText = textNodes.map(n => n.text).join('');
    expect(allText).toContain('メモ: 要注意');
  });

  it('omits assignee and uses totalDays=0 when all phaseTasks are background', () => {
    const allBg = [{ isBackground: true, totalDays: 3, assignedPeople: ['Alice'] }];
    const body = buildTaskBody(baseItem, 0, allBg, baseRelease, baseJC, basePeople);
    expect(body.fields).not.toHaveProperty('assignee');
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText = textNodes.map(n => n.text).join('');
    expect(allText).toContain('稼働日数（合計）: 0日');
  });

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
});

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

  it('omits 担当チーム line when phaseType is null', () => {
    const body = buildSubTaskBody(baseSubTask, 'PROJ-1', null, baseJC, basePeople);
    const textNodes = body.fields.description.content[0].content.filter(n => n.type === 'text');
    const allText   = textNodes.map(n => n.text).join('');
    expect(allText).not.toContain('担当チーム');
    expect(allText).toContain('稼働日数');
  });

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
});

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

  it('throws with JIRA errors object when the error response contains field errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ errorMessages: [], errors: { summary: 'Field required' } }),
    });
    await expect(jiraApiWith('/issue', {}, validJC))
      .rejects.toThrow('summary: Field required');
  });

  it('throws with JIRA message when the error response contains a message field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      json: async () => ({ message: 'You do not have permission' }),
    });
    await expect(jiraApiWith('/issue', {}, validJC))
      .rejects.toThrow('You do not have permission');
  });

  it('sends Basic auth header with base64-encoded credentials', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await jiraApiWith('/myself', {}, validJC);
    const headers = mockFetch.mock.calls[0][1].headers;
    const expected = 'Basic ' + btoa('user@example.com:secret-token');
    expect(headers['Authorization']).toBe(expected);
  });
});
