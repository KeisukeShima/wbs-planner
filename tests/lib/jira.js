/**
 * Pure functions extracted from wbs-planner.html for unit testing.
 * Keep in sync with the corresponding implementations in wbs-planner.html.
 */

// ─── toJiraDate ──────────────────────────────────────────────────────────────

export const toJiraDate = d =>
  [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');

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
    ...(taskStart && jc.startDateFieldId ? { [jc.startDateFieldId]: toJiraDate(taskStart) } : {}),
    ...(taskEnd         ? { duedate:   toJiraDate(taskEnd) }              : {}),
    ...extraFields,
  }};
}

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
    ...(subAccountId   ? { assignee:  { accountId: subAccountId } } : {}),
    ...(task.startDate && jc.startDateFieldId ? { [jc.startDateFieldId]: toJiraDate(task.startDate) } : {}),
    ...(task.endDate   ? { duedate:   toJiraDate(task.endDate) }   : {}),
  }};
}

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
