/**
 * Unit tests for runScheduleWith — the core scheduler logic.
 *
 * Date reference for 2026-01:
 *   Jan 01 = Thu    Jan 05 = Mon    Jan 09 = Fri
 *   Jan 12 = Mon    Jan 16 = Fri    Jan 19 = Mon
 *   Jan 23 = Fri (used as releaseDate)
 *
 * With evalPeriod = { value: 2, unit: 'weeks' } (10 biz days) and
 * releaseDate = Jan 23, evalStart = Jan 12.
 */
import { describe, it, expect } from 'vitest';
import { runScheduleWith, fmt } from '../lib/core.js';

// ─── Config factory ──────────────────────────────────────────────────────────

/**
 * Build a minimal config with one release and optional items.
 *
 * Default release window: startDate=Jan 05, releaseDate=Jan 23
 * Default evalPeriod: 2 weeks (10 biz days) → evalStart = Jan 12
 */
function makeConfig({
  items        = [],
  phaseTypes   = [{ name: '開発', color: '#3B82F6', inEval: false }],
  people       = [{ name: 'Alice', phases: ['開発'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' }],
  startDate    = '2026-01-05',
  releaseDate  = '2026-01-23',
  evalPeriod   = { value: 2, unit: 'weeks' },
  showEvalZone = true,
  holidays     = { national: [], company: [] },
} = {}) {
  return {
    startDate,
    phaseTypes,
    people,
    holidays,
    releases: [{
      id:          'r1',
      name:        'リリース1',
      color:       '#6D28D9',
      startDate,
      releaseDate,
      evalPeriod,
      showEvalZone,
      evalZone:    { label: 'リリース評価', color: '#8B5CF6' },
      epicKey:     '',
      items,
    }],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('empty / no-release cases', () => {
  it('returns empty arrays when releases is empty', () => {
    const cfg = { ...makeConfig(), releases: [] };
    const { tasks, releaseMeta, warnings } = runScheduleWith(cfg);
    expect(tasks).toHaveLength(0);
    expect(releaseMeta).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('returns no tasks when release has no items', () => {
    const { tasks, warnings } = runScheduleWith(makeConfig());
    expect(tasks).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe('single task scheduling', () => {
  it('5-day task starts on startDate and ends on the 5th biz day', () => {
    const cfg = makeConfig({
      items: [{ name: 'Task A', category: '', note: '', phases: [{ type: '開発', days: 5 }] }],
    });
    const { tasks, warnings } = runScheduleWith(cfg);

    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.status).toBe('complete');
    expect(fmt(t.startDate)).toBe('2026-01-05');  // Mon
    expect(fmt(t.endDate)).toBe('2026-01-09');    // Fri
    expect(t.assignedPeople).toEqual(['Alice']);
    expect(warnings).toHaveLength(0);
  });

  it('task that ends before evalStart does not generate a warning', () => {
    // 5-day task ends Jan 9 < evalStart Jan 12 → no warning
    const cfg = makeConfig({
      items: [{ name: 'Safe', category: '', note: '', phases: [{ type: '開発', days: 5 }] }],
    });
    const { warnings } = runScheduleWith(cfg);
    expect(warnings).toHaveLength(0);
  });

  it('task that ends on or after evalStart generates an overflow warning', () => {
    // 10-day task: Jan 5–16 → endDate Jan 16 >= evalStart Jan 12 → warning
    const cfg = makeConfig({
      items: [{ name: 'Long', category: '', note: '', phases: [{ type: '開発', days: 10 }] }],
    });
    const { tasks, warnings } = runScheduleWith(cfg);
    expect(fmt(tasks[0].endDate)).toBe('2026-01-16');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('リリース評価開始');
  });

  it('background task starts immediately with no person assigned', () => {
    const cfg = makeConfig({
      items: [{ name: 'BG', category: '', note: '', phases: [{ type: '開発', days: 3, background: true }] }],
    });
    const { tasks, warnings } = runScheduleWith(cfg);
    const t = tasks[0];
    expect(t.isBackground).toBe(true);
    expect(t.assignedPeople).toEqual([]);
    expect(t.status).toBe('complete');
    expect(warnings).toHaveLength(0); // background tasks don't trigger eval warning
  });
});

describe('evalPhase (inEval flag)', () => {
  it('inEval task starts from evalStart, not from release startDate', () => {
    // evalStart = Jan 12 for this config
    const cfg = makeConfig({
      phaseTypes: [{ name: '評価作業', color: '#8B5CF6', inEval: true }],
      people:     [{ name: 'Alice', phases: ['評価作業'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' }],
      items: [{ name: 'Eval Task', category: '', note: '', phases: [{ type: '評価作業', days: 3 }] }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(fmt(tasks[0].startDate)).toBe('2026-01-12');  // evalStart
  });

  it('inEval task does not generate an overflow warning even when it ends after evalStart', () => {
    const cfg = makeConfig({
      phaseTypes: [{ name: '評価作業', color: '#8B5CF6', inEval: true }],
      people:     [{ name: 'Alice', phases: ['評価作業'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' }],
      items: [{ name: 'Eval Task', category: '', note: '', phases: [{ type: '評価作業', days: 5 }] }],
    });
    const { tasks, warnings } = runScheduleWith(cfg);
    // ends Jan 16 >= evalStart Jan 12, but isEvalPhase → no warning
    expect(tasks[0].isEvalPhase).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('showEvalZone=false suppresses overflow warnings for normal phases too', () => {
    const cfg = makeConfig({
      showEvalZone: false,
      items: [{ name: 'Long', category: '', note: '', phases: [{ type: '開発', days: 10 }] }],
    });
    const { warnings } = runScheduleWith(cfg);
    expect(warnings).toHaveLength(0);
  });
});

describe('predecessor dependency', () => {
  it('phase 2 starts only after phase 1 completes', () => {
    // Alice does both phases sequentially
    const cfg = makeConfig({
      items: [{
        name: 'Multi-phase', category: '', note: '',
        phases: [
          { type: '開発', days: 3 },
          { type: '開発', days: 2 },
        ],
      }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(tasks).toHaveLength(2);

    const [p1, p2] = tasks;
    // Phase 1: Jan 5 (Mon) → Jan 7 (Wed), 3 days
    expect(fmt(p1.startDate)).toBe('2026-01-05');
    expect(fmt(p1.endDate)).toBe('2026-01-07');

    // Phase 2 waits for phase 1 to complete: Jan 8 (Thu) → Jan 9 (Fri), 2 days
    expect(fmt(p2.startDate)).toBe('2026-01-08');
    expect(fmt(p2.endDate)).toBe('2026-01-09');
  });
});

describe('utilization rate', () => {
  it('50% utilization doubles the calendar duration', () => {
    // At 50% utilization, 2 totalDays → actualDays = ceil(2/0.5) = 4 biz days
    const cfg = makeConfig({
      people: [{ name: 'Bob', phases: ['開発'], availableFrom: null, utilization: 0.5, note: '', jiraUser: '' }],
      items: [{ name: 'Slow', category: '', note: '', phases: [{ type: '開発', days: 2 }] }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(tasks[0].actualDays).toBe(4);
    // Starts Jan 5 (Mon), 4 biz days → ends Jan 8 (Thu)
    expect(fmt(tasks[0].endDate)).toBe('2026-01-08');
  });
});

describe('no eligible person', () => {
  it('generates a "person not found" warning when no one can handle the phase', () => {
    // Bob only handles '設計' but item phase is '開発'
    const cfg = makeConfig({
      people: [{ name: 'Bob', phases: ['設計'], availableFrom: null, utilization: 1.0, note: '', jiraUser: '' }],
      items: [{ name: 'Orphan', category: '', note: '', phases: [{ type: '開発', days: 3 }] }],
    });
    const { warnings } = runScheduleWith(cfg);
    expect(warnings.some(w => w.includes('担当できる人が見つかりませんでした'))).toBe(true);
  });
});

describe('fixed start date', () => {
  it('fixed task starts on exact business day when fixedStart is a weekday', () => {
    // Jan 19 = Monday (business day)
    const cfg = makeConfig({
      items: [{ name: 'Fixed', category: '', note: '', phases: [{ type: '開発', days: 3, fixedStart: '2026-01-19' }] }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(fmt(tasks[0].startDate)).toBe('2026-01-19');
  });

  it('fixed task starts on next business day when fixedStart falls on a holiday', () => {
    // 2026-01-12 is a national holiday (成人の日); next biz day = 2026-01-13 (Tuesday)
    const cfg = makeConfig({
      holidays: { national: ['2026-01-12'], company: [] },
      startDate: '2026-01-05',
      releaseDate: '2026-01-23',
      items: [{ name: 'HolFixed', category: '', note: '', phases: [{ type: '開発', days: 2, fixedStart: '2026-01-12' }] }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(tasks[0].startDate).not.toBeNull();
    expect(fmt(tasks[0].startDate)).toBe('2026-01-13');
  });

  it('fixed task starts on next business day when fixedStart falls on a Saturday', () => {
    // 2026-01-03 = Saturday; next biz day = 2026-01-05 (Monday)
    const cfg = makeConfig({
      items: [{ name: 'WkndFixed', category: '', note: '', phases: [{ type: '開発', days: 2, fixedStart: '2026-01-03' }] }],
    });
    const { tasks } = runScheduleWith(cfg);
    expect(tasks[0].startDate).not.toBeNull();
    expect(fmt(tasks[0].startDate)).toBe('2026-01-05');
  });
});

describe('releaseMeta', () => {
  it('releaseMeta contains evalStart for the release', () => {
    const { releaseMeta } = runScheduleWith(makeConfig());
    expect(releaseMeta).toHaveLength(1);
    // evalStart = Jan 12 (10 biz days before Jan 23)
    expect(fmt(releaseMeta[0].evalStart)).toBe('2026-01-12');
  });

  it('releaseMeta preserves release name and color', () => {
    const { releaseMeta } = runScheduleWith(makeConfig());
    expect(releaseMeta[0].name).toBe('リリース1');
    expect(releaseMeta[0].color).toBe('#6D28D9');
  });
});
