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
