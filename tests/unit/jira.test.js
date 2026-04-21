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
