// 05 portfolio-health-diff
// Health computed from how work behaves, reconciled against what owners reported.
// Only the disagreements are printed, because only those need a meeting.
//
//   node examples/05-portfolio-health-diff/run.mjs                      all scenarios
//   node examples/05-portfolio-health-diff/run.mjs --fault none         the honest read
//   node examples/05-portfolio-health-diff/run.mjs --fault denominator  percent complete, three ways
//   node examples/05-portfolio-health-diff/run.mjs --fault started      "Blocked" counted as started
//   node examples/05-portfolio-health-diff/run.mjs --fault join         a join that is almost right
import { pathToFileURL } from 'node:url';
import { generatePortfolio, RISK_MARKER } from '../../demo-data/generate.mjs';

export const STALE_DAYS = 21;
const SEVERITY = { Green: 0, Amber: 1, Red: 2 };
const CLOSED = new Set(['Done', 'Cancelled']);

const isOpen = (i) => !CLOSED.has(i.status);
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const key = (x) => `${x.project} / ${x.milestone}`;

// Total days a due date has been pushed out, summed over every recorded move.
export function driftDays(item) {
  return item.due_history.reduce((sum, h) => sum + days(h.from, h.to), 0);
}

// Health from behaviour only. Nothing here reads the status field's colour,
// because the colour is the thing we are trying to check.
export function computeHealth(items, asOf) {
  const open = items.filter(isOpen);
  const cancelled = items.filter((i) => i.status === 'Cancelled').length;
  const delivered = items.filter((i) => i.status === 'Done').length;
  const signals = {
    open: open.length,
    cancelled,
    delivered,
    // Open work nobody has touched in three weeks.
    stale: open.filter((i) => days(i.updated_at.slice(0, 10), asOf) > STALE_DAYS).length,
    // Open work already past the date it carries.
    overdue: open.filter((i) => i.due_date && i.due_date < asOf).length,
    // A date nobody confirmed. Absence is a finding, not a row to skip.
    blankDue: open.filter((i) => !i.due_date).length,
    // The team's own risk convention, which lives in the title, not the status field.
    marked: open.filter((i) => i.title.startsWith(RISK_MARKER)).length,
    drift: open.reduce((sum, i) => sum + driftDays(i), 0),
  };

  const reasons = [];
  if (signals.marked) reasons.push(`${signals.marked} flagged by the team in the title`);
  if (signals.overdue) reasons.push(`${signals.overdue} overdue`);
  if (signals.stale) reasons.push(`${signals.stale} untouched over ${STALE_DAYS} days`);
  if (signals.drift >= 10) reasons.push(`${signals.drift} days of due-date drift`);
  if (signals.blankDue) reasons.push(`${signals.blankDue} with no confirmed date`);
  // Work that left the denominator did not get delivered. It still counts.
  const mostlyCancelled = cancelled > 0 && cancelled * 2 >= items.length;
  if (mostlyCancelled) reasons.push(`${cancelled} of ${items.length} cancelled rather than delivered`);

  let rag = 'Green';
  if (signals.overdue >= 1 || signals.stale >= 1 || signals.drift >= 10 || signals.blankDue >= 1 || mostlyCancelled) rag = 'Amber';
  if (signals.marked >= 1 || signals.overdue >= 2 || (signals.stale >= 2 && signals.drift >= 20)) rag = 'Red';

  // A milestone with nothing open is only Green if the work actually shipped.
  // Closing it by cancelling the remainder is not the same outcome.
  if (!signals.open && !mostlyCancelled) {
    rag = 'Green';
    reasons.length = 0;
    reasons.push(`all ${items.length} closed, ${delivered} delivered`);
  }

  return { rag, signals, reasons };
}

// Group items into one computed read per project milestone.
export function computeAll(items, asOf) {
  const groups = new Map();
  for (const i of items) {
    if (!groups.has(key(i))) groups.set(key(i), { project: i.project, milestone: i.milestone, items: [] });
    groups.get(key(i)).items.push(i);
  }
  return [...groups.values()].map((g) => ({ ...g, ...computeHealth(g.items, asOf) }));
}

// Reconcile the computed read against what each owner reported.
// `on` picks the join key. This is the whole point of the `join` scenario.
export function reconcile(computed, reports, on = 'project+milestone') {
  const joinKey = on === 'milestone' ? (x) => x.milestone : key;
  const index = new Map();
  for (const c of computed) if (!index.has(joinKey(c))) index.set(joinKey(c), c); // first match wins
  const gaps = [];
  let matched = 0;
  for (const rep of reports) {
    const c = index.get(joinKey(rep));
    if (!c) continue;
    matched++;
    if (c.rag !== rep.rag) {
      gaps.push({
        project: rep.project,
        milestone: rep.milestone,
        reported: rep.rag,
        computed: c.rag,
        by: rep.reported_by,
        // Optimism is the direction that hurts: the owner is calmer than the behaviour.
        direction: SEVERITY[c.rag] > SEVERITY[rep.rag] ? 'reported better than it behaves' : 'reported worse than it behaves',
        reasons: c.reasons,
        comparedWith: key(c),
      });
    }
  }
  return { gaps, matched };
}

// Percent complete, three ways, on the same work.
export function progress(items) {
  const total = items.length;
  const cancelled = items.filter((i) => i.status === 'Cancelled').length;
  const done = items.filter((i) => i.status === 'Done').length;
  const pts = (list) => list.reduce((s, i) => s + i.points, 0);
  const livePts = pts(items) - pts(items.filter((i) => i.status === 'Cancelled'));
  const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);
  return {
    total, cancelled, done,
    byCountAll: pct(done, total),                                  // cancelled work still in the denominator
    byCountLive: pct(done, total - cancelled),                     // cancelled work removed from it
    byPointsLive: pct(pts(items.filter((i) => i.status === 'Done')), livePts),
  };
}

// How much work is "in flight" depends on whether the workspace calls
// "Blocked" a started state. Blocked means waiting on somebody else.
export function inFlight(items, { blockedCountsAsStarted }) {
  const started = new Set(blockedCountsAsStarted ? ['In progress', 'Blocked'] : ['In progress']);
  return items.filter((i) => started.has(i.status)).length;
}

function reportGaps(gaps, log) {
  for (const g of gaps) {
    log(`  gap     ${g.project} / ${g.milestone}: ${g.by} reported ${g.reported}, behaviour says ${g.computed}`);
    log(`            ${g.direction}`);
    if (g.reasons.length) log(`            why: ${g.reasons.join('; ')}`);
  }
}

export const SCENARIOS = {
  none: 'the honest read: computed health against reported status',
  denominator: 'percent complete, three ways, on the same work',
  started: '"Blocked" configured as a started state',
  join: 'a join that is almost right',
};

export function runScenario(name, log = () => {}) {
  if (!SCENARIOS[name]) throw new Error(`unknown --fault ${name}, use one of: ${Object.keys(SCENARIOS).join(', ')}`);
  const { asOf, items, reports } = generatePortfolio();
  const computed = computeAll(items, asOf);
  log(`\nScenario: ${SCENARIOS[name]}`);
  log(`  data    ${items.length} synthetic items, ${reports.length} reported statuses, as of ${asOf}`);

  if (name === 'none') {
    const { gaps, matched } = reconcile(computed, reports);
    log(`  read    ${matched} milestones reconciled, ${gaps.length} disagree`);
    reportGaps(gaps, log);
    log(`  agenda  ${gaps.length} of ${matched} milestones. The other ${matched - gaps.length} need no meeting.`);
    const optimistic = gaps.filter((g) => g.direction.startsWith('reported better')).length;
    log(`  of the ${gaps.length}, ${optimistic} were reported better than they behave`);
    return { scenario: name, matched, gaps, optimistic };
  }

  if (name === 'denominator') {
    const rows = computed.map((c) => ({ at: key(c), ...progress(c.items) }))
      // Only the milestones where the choice of denominator actually moves the number.
      .filter((p) => new Set([p.byCountAll, p.byCountLive, p.byPointsLive]).size > 1)
      .sort((a, b) => (b.byCountLive - b.byCountAll) - (a.byCountLive - a.byCountAll));
    log(`  ${rows.length} milestones report a different number depending on what you count`);
    for (const p of rows) {
      log(`  ${p.at}`);
      log(`            ${p.byCountAll}% by item count, all ${p.total} items in the denominator`);
      log(`            ${p.byCountLive}% by item count, with ${p.cancelled} cancelled removed from it`);
      log(`            ${p.byPointsLive}% by estimate points, same work, same cancellations`);
    }
    const worst = rows[0];
    if (worst) {
      log(`  biggest gap at ${worst.at}: ${worst.byCountAll}% to ${worst.byCountLive}% by cancelling, not by delivering`);
    }
    const whole = progress(items);
    log(`  portfolio ${whole.byCountAll}% / ${whole.byCountLive}% / ${whole.byPointsLive}% on the same ${whole.total} items`);
    return { scenario: name, rows, whole };
  }

  if (name === 'started') {
    const strict = inFlight(items, { blockedCountsAsStarted: false });
    const loose = inFlight(items, { blockedCountsAsStarted: true });
    const blocked = loose - strict;
    log(`  ${strict} items in flight when only "In progress" counts as started`);
    log(`  ${loose} items in flight when "Blocked" counts as started too`);
    log(`  the difference is ${blocked} items that are waiting on somebody else`);
    log(`  that is ${Math.round(((loose - strict) / loose) * 1000) / 10}% of the reported load, on work that has not begun`);
    log(`  every capacity read built on the second number overstates the team`);
    return { scenario: name, strict, loose, blocked };
  }

  // join
  const strict = reconcile(computed, reports, 'project+milestone');
  const loose = reconcile(computed, reports, 'milestone');
  log(`  joined on project and milestone: ${strict.matched} matched, ${strict.gaps.length} disagree`);
  log(`  joined on milestone name alone:  ${loose.matched} matched, ${loose.gaps.length} disagree`);
  const at = (g) => `${g.project} / ${g.milestone}`;
  const wrong = loose.gaps.filter((g) => g.comparedWith !== at(g)).length;
  log(`  the loose join compared ${wrong} of the ${loose.matched} reports against a different project's work`);
  log(`  neither join reported an error, and every report matched something`);

  const missed = strict.gaps.filter((s) => !loose.gaps.some((l) => at(l) === at(s)));
  const invented = loose.gaps.filter((l) => !strict.gaps.some((s) => at(s) === at(l)));
  for (const m of missed) log(`  missed  ${at(m)}: a real gap the loose join did not report`);
  for (const f of invented) log(`  false   ${at(f)}: reported as a gap against ${f.comparedWith}'s work, not its own`);

  // The dangerous case is not a different total. It is the same total, wrong rows.
  if (strict.gaps.length === loose.gaps.length) {
    log(`  both joins reported ${strict.gaps.length} gaps. The totals agree and ${missed.length + invented.length} of the rows do not.`);
    log(`  a headline that matches is why nobody checks the join`);
  } else {
    log(`  the totals differ by ${Math.abs(strict.gaps.length - loose.gaps.length)}, ${missed.length} missed and ${invented.length} invented`);
  }
  return { scenario: 'join', strict, loose, wrongAttributions: wrong, missed, invented };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--fault');
  const names = i > -1 ? [process.argv[i + 1]] : Object.keys(SCENARIOS);
  for (const n of names) runScenario(n, console.log);
}
