/**
 * Pure functions extracted from wbs-planner.html for unit testing.
 * Keep in sync with the corresponding implementations in wbs-planner.html.
 */

// ─── Date utilities ─────────────────────────────────────────────────────────

export const p2     = n => String(n).padStart(2, '0');
export const parse  = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmt    = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtJP = d => `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`;

export function isBiz(d, hols) {
  const w = d.getDay();
  return w !== 0 && w !== 6 && !hols.has(fmt(d));
}

export function countBiz(s, e, hols) {
  let n = 0, d = new Date(s);
  while (d <= e) { if (isBiz(d, hols)) n++; d = addDays(d, 1); }
  return n;
}

export function subtractBiz(end, n, hols) {
  let d = new Date(end), c = 0;
  while (c < n) { if (isBiz(d, hols)) c++; if (c < n) d = addDays(d, -1); }
  return d;
}

/**
 * Convert an evalPeriod object to business days.
 * @param {{ value: number, unit: 'days'|'weeks'|'months' }} period
 * @param {Set<string>} hols
 * @param {string} releaseDate  ISO date string (e.g. '2026-01-23')
 */
export function evalToBusinessDays(period, hols, releaseDate) {
  const { value, unit } = period;
  if (unit === 'days')  return value;
  if (unit === 'weeks') return value * 5;
  // months: count biz days in `value` calendar months before release
  const rel   = parse(releaseDate);
  const start = new Date(rel.getFullYear(), rel.getMonth() - value, rel.getDate());
  return countBiz(start, rel, hols);
}

// ─── Config helpers ──────────────────────────────────────────────────────────

export function genId() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Parameterised getHolSet — reads from a config object instead of global C.
 * @param {{ holidays: { national: string[], company: string[] } }} config
 * @returns {Set<string>}
 */
export function getHolSetFrom(config) {
  const s = new Set(config.holidays.national);
  config.holidays.company.forEach(d => s.add(d));
  return s;
}

/**
 * Migrate a raw config object through all backwards-compat transformations.
 * Equivalent to the migration portion of loadConfig() in wbs-planner.html.
 * Does NOT touch localStorage.
 *
 * @param {object} raw
 * @returns {object}  migrated config (deep-cloned, mutated)
 */
export function migrateConfig(raw) {
  const c = JSON.parse(JSON.stringify(raw));

  // ── 旧フィールド除去 ──
  delete c.evalPhase;

  // ── 旧形式マイグレーション：items がトップレベルにある場合 ──
  if (c.items && !c.releases) {
    c.releases = [{
      id:          genId(),
      name:        'リリース1',
      color:       '#6D28D9',
      startDate:   c.startDate   || '2026-04-20',
      releaseDate: c.releaseDate || '2026-07-15',
      evalPeriod:  c.evalPeriod  || { value: 4, unit: 'weeks' },
      showEvalZone: c.showEvalZone !== false,
      evalZone:    c.evalZone    || { label: 'リリース評価', color: '#8B5CF6' },
      epicKey:     c.epicKey     || '',
      items:       c.items,
    }];
    delete c.items;
    delete c.releaseDate;
    delete c.evalPeriod;
    delete c.showEvalZone;
    delete c.evalZone;
    delete c.epicKey;
  }

  // ── releases がない場合 ──
  if (!c.releases) c.releases = [];

  // ── 各リリースのデフォルト補完 ──
  c.releases.forEach(r => {
    if (!r.id)          r.id = genId();
    if (!r.evalPeriod)  r.evalPeriod = { value: 4, unit: 'weeks' };
    if (!r.evalZone)    r.evalZone   = { label: 'リリース評価', color: '#8B5CF6' };
    if (r.showEvalZone === undefined) r.showEvalZone = true;
    if (!r.items)       r.items = [];
  });

  return c;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Parameterised runSchedule — reads from a config object instead of global C.
 * Keep in sync with runSchedule() in wbs-planner.html.
 *
 * @param {object} config
 * @returns {{ tasks: object[], releaseMeta: object[], warnings: string[], hols: Set<string> }}
 */
export function runScheduleWith(config) {
  const cfg  = config;
  const hols = getHolSetFrom(cfg);

  if (!cfg.releases || cfg.releases.length === 0) {
    return { tasks: [], releaseMeta: [], warnings: [], hols };
  }

  const releaseMeta = cfg.releases.map(r => {
    const releaseDate = parse(r.releaseDate || cfg.startDate);
    const evalBD      = evalToBusinessDays(r.evalPeriod || { value: 4, unit: 'weeks' }, hols, r.releaseDate || cfg.startDate);
    const evalStart   = subtractBiz(releaseDate, evalBD, hols);
    return {
      id:          r.id,
      name:        r.name,
      color:       r.color || '#6D28D9',
      startDate:   r.startDate || cfg.startDate,
      releaseDate: r.releaseDate || cfg.startDate,
      evalStart,
      showEvalZone: r.showEvalZone !== false,
      evalZone:    r.evalZone || { label: 'リリース評価', color: '#8B5CF6' },
    };
  });

  const tasks = [];
  cfg.releases.forEach((release, rIdx) => {
    const meta = releaseMeta[rIdx];
    (release.items || []).forEach((item, iIdx) => {
      let remaining = item.phases.reduce((s, p) => s + p.days, 0);
      item.phases.forEach((phase, pIdx) => {
        const ptDef      = cfg.phaseTypes.find(pt => pt.name === phase.type);
        const isEvalPhase = !!(ptDef && ptDef.inEval);
        tasks.push({
          id:              `${rIdx}-${iIdx}-${pIdx}`,
          releaseIdx:      rIdx,
          releaseId:       release.id,
          itemIdx:         iIdx,
          itemName:        item.name,
          category:        item.category || '',
          phaseType:       phase.type,
          totalDays:       phase.days,
          phaseIdx:        pIdx,
          wbsNo:           `${iIdx + 1}.${pIdx + 1}`,
          predId:          pIdx > 0 ? `${rIdx}-${iIdx}-${pIdx - 1}` : null,
          priority:        remaining,
          releasePriority: cfg.releases.length - rIdx,
          releaseStartDate: isEvalPhase ? meta.evalStart : parse(release.startDate || cfg.startDate),
          evalStart:       meta.evalStart,
          isBackground:    !!phase.background,
          isEvalPhase:     isEvalPhase,
          isFixed:         !!phase.fixedStart,
          fixedStartDate:  phase.fixedStart ? parse(phase.fixedStart) : null,
          allowedPeople:   phase.allowedPeople || null,
          requireAll:      !!phase.requireAll,
          status:          'waiting',
          startDate:       null,
          endDate:         null,
          daysWorked:      0,
          assignedPeople:  [],
          hasConflict:     false,
          actualDays:      phase.days,
        });
        remaining -= phase.days;
      });
    });
  });

  const taskMap = {};
  tasks.forEach(t => { taskMap[t.id] = t; });

  const personBusy = {};
  cfg.people.forEach(p => { personBusy[p.name] = 0; });

  function pickPeople(task, d) {
    const phase   = cfg.releases[task.releaseIdx].items[task.itemIdx].phases[task.phaseIdx];
    const allowed = phase.allowedPeople ? new Set(phase.allowedPeople) : null;

    const eligible = cfg.people.filter(p =>
      p.phases.includes(task.phaseType) &&
      (!p.availableFrom || parse(p.availableFrom) <= d) &&
      (!allowed || allowed.has(p.name)) &&
      personBusy[p.name] === 0
    );

    if (phase.requireAll && phase.allowedPeople) {
      const allFree = phase.allowedPeople.every(name => {
        const p = cfg.people.find(x => x.name === name);
        return p && personBusy[name] === 0 && (!p.availableFrom || parse(p.availableFrom) <= d);
      });
      return allFree ? phase.allowedPeople : null;
    }
    return eligible.length > 0 ? [eligible[0].name] : null;
  }

  const _start = tasks.reduce(
    (min, t) => t.releaseStartDate < min ? t.releaseStartDate : min,
    tasks[0]?.releaseStartDate || parse(cfg.startDate)
  );
  const latestRelease = releaseMeta.reduce((max, m) => {
    const d = parse(m.releaseDate);
    return d > max ? d : max;
  }, parse(releaseMeta[0].releaseDate));
  const limit = addDays(latestRelease, 365);

  let d = new Date(_start);
  let stalledDays = 0;
  const MAX_STALLED = 30;

  while (d <= limit) {
    if (!isBiz(d, hols)) { d = addDays(d, 1); continue; }

    // 固定開始日タスクを強制開始
    for (const t of tasks) {
      if (t.isFixed && t.status === 'waiting' && d >= t.fixedStartDate) {
        const assigned = pickPeople(t, d);
        t.status = 'inProgress'; t.startDate = new Date(d);
        if (assigned) {
          t.assignedPeople = assigned;
          const utils = assigned.map(n => {
            const p = cfg.people.find(x => x.name === n);
            return (p && p.utilization > 0) ? p.utilization : 1.0;
          });
          t.actualDays = Math.ceil(t.totalDays / Math.min(...utils));
          assigned.forEach(n => { personBusy[n]++; });
        } else {
          const phase = cfg.releases[t.releaseIdx].items[t.itemIdx].phases[t.phaseIdx];
          const fb = phase.allowedPeople ? phase.allowedPeople[0] : null;
          t.assignedPeople = fb ? [fb + '(要調整)'] : [];
          t.hasConflict = true;
        }
      }
    }

    // 先行完了 → ready（かつリリース開始日を過ぎているもの）
    for (const t of tasks) {
      if (t.status === 'waiting' && !t.isFixed && d >= t.releaseStartDate) {
        const pred = t.predId ? taskMap[t.predId] : null;
        if (!pred || pred.status === 'complete') t.status = 'ready';
      }
    }

    // ready タスクを優先度順に着手
    const ready = tasks
      .filter(t => t.status === 'ready')
      .sort((a, b) =>
        b.releasePriority - a.releasePriority ||
        b.priority        - a.priority        ||
        a.releaseIdx      - b.releaseIdx      ||
        a.itemIdx         - b.itemIdx         ||
        a.phaseIdx        - b.phaseIdx
      );

    for (const t of ready) {
      if (t.isBackground) {
        t.status = 'inProgress'; t.startDate = new Date(d); t.assignedPeople = [];
      } else {
        const assigned = pickPeople(t, d);
        if (assigned) {
          t.status = 'inProgress'; t.startDate = new Date(d);
          t.assignedPeople = assigned;
          const utils = assigned.map(n => {
            const p = cfg.people.find(x => x.name === n);
            return (p && p.utilization > 0) ? p.utilization : 1.0;
          });
          t.actualDays = Math.ceil(t.totalDays / Math.min(...utils));
          assigned.forEach(n => { personBusy[n]++; });
        }
      }
    }

    // 作業実行 & 完了判定
    for (const t of tasks) {
      if (t.status === 'inProgress') {
        t.daysWorked++;
        if (t.daysWorked >= t.actualDays) {
          t.status = 'complete'; t.endDate = new Date(d);
          if (!t.isBackground) t.assignedPeople.forEach(n => { if (n in personBusy) personBusy[n]--; });
        }
      }
    }

    // ストール検知
    const newStartCount  = tasks.filter(t => t.startDate?.getTime() === d.getTime()).length;
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

  // 警告収集
  const warnings = [];
  tasks.forEach(t => {
    if (t.endDate && t.endDate >= t.evalStart && !t.isBackground && !t.isEvalPhase) {
      const rm = releaseMeta[t.releaseIdx];
      if (rm.showEvalZone)
        warnings.push(`[${rm.name}]「${t.itemName} / ${t.phaseType}」がリリース評価開始（${fmtJP(t.evalStart)}）を超過しています。`);
    }
    if (!t.startDate && t.status !== 'complete')
      warnings.push(`「${t.itemName} / ${t.phaseType}」を担当できる人が見つかりませんでした。`);
    if (t.hasConflict)
      warnings.push(`「${t.itemName} / ${t.phaseType}」でリソース競合が発生しました。`);
  });

  return { tasks, releaseMeta, warnings, hols };
}
