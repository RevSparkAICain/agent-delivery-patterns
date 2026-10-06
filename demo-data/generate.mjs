// Seeded generator for synthetic delivery data. Same seed, same output, every run.
// Projects have invented names and people are role labels only.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROLES = ['Delivery lead', 'Workstream lead', 'Analyst', 'Sponsor', 'Change manager'];
const STATUSES = ['Not started', 'In progress', 'Blocked', 'Done'];
const TASKS = ['Draft test plan', 'Confirm cutover window', 'Update risk log', 'Run user training',
  'Close open defects', 'Sign off data migration', 'Publish release notes', 'Review vendor estimate'];

export function loadSeed() {
  return JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
}

// mulberry32: small, fast, good enough for demo data
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Returns { records, plan }.
// records: the tracker items. Some carry a recorded decision (a signed-off due date).
// plan: the reviewed change list, in tracker field names, that a batch job should apply.
export function generate(cfg = loadSeed()) {
  const r = rng(cfg.seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const records = [];
  const plan = [];

  for (const project of cfg.projects) {
    const code = project.split(' ')[1].slice(0, 3).toUpperCase();
    for (let i = 1; i <= cfg.itemsPerProject; i++) {
      const start = addDays(cfg.baseDate, Math.floor(r() * 30));
      const rec = {
        id: `${code}-${String(i).padStart(3, '0')}`,
        project,
        title: pick(TASKS),
        owner: pick(ROLES),
        status: pick(STATUSES),
        start_date: start,
        due_date: addDays(start, 14 + Math.floor(r() * 45)),
        updated_at: cfg.recordedAt,
        decisions: [],
      };
      if (r() < 0.25) {
        rec.decisions.push({ field: 'due_date', value: rec.due_date, by: 'Sponsor', note: 'Date signed off at stage gate' });
      }
      records.push(rec);

      if (r() < 0.6) {
        const set = { due_date: addDays(rec.due_date, 7 + Math.floor(r() * 21)) };
        if (r() < 0.5) set.owner = pick(ROLES.filter((x) => x !== rec.owner));
        if (r() < 0.4) set.status = pick(STATUSES.filter((x) => x !== rec.status));
        plan.push({ id: rec.id, set });
      }
    }
  }
  return { records, plan };
}

// ---------------------------------------------------------------------------
// Portfolio data set, used by example 05. Kept separate from generate() above
// so the two examples can evolve without moving each other's numbers.
// ---------------------------------------------------------------------------

// The six standard milestones every project is cut into.
export const MILESTONES = ['Discovery', 'Design', 'Build', 'Test', 'Cutover', 'Benefits'];
// "Blocked" means waiting on somebody else. Whether a workspace counts it as
// started is a configuration choice, and example 05 shows what that costs.
export const PORTFOLIO_STATUSES = ['Not started', 'In progress', 'Blocked', 'Done', 'Cancelled'];
export const RAG = ['Green', 'Amber', 'Red'];
// Some teams encode risk in the item title because the status field does not
// carry what they mean. This is the convention they use.
export const RISK_MARKER = '!! ';

// Returns { asOf, items, reports }.
//   items   - tracker items, each on one project milestone. due_date may be null,
//             and due_history records every time the date was pushed out.
//   reports - one self-reported RAG per project milestone, from its owner.
export function generatePortfolio(cfg = loadSeed()) {
  // Offset the seed so this data set is independent of generate()'s stream.
  const r = rng(cfg.seed + 977);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const asOf = '2026-11-16';
  const items = [];
  const reports = [];

  for (const project of cfg.projects) {
    const code = project.split(' ')[1].slice(0, 3).toUpperCase();
    let n = 0;
    for (const milestone of MILESTONES) {
      for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
        n++;
        const status = pick(PORTFOLIO_STATUSES);
        const open = status !== 'Done' && status !== 'Cancelled';
        const start = addDays(cfg.baseDate, Math.floor(r() * 20));

        // Due dates get pushed out. Each push is recorded, so drift is measurable.
        const pushes = r() < 0.45 ? 1 + Math.floor(r() * 3) : 0;
        let due = addDays(start, 10 + Math.floor(r() * 40));
        const due_history = [];
        for (let p = 0; p < pushes; p++) {
          const next = addDays(due, 5 + Math.floor(r() * 20));
          due_history.push({ from: due, to: next, moved_on: addDays(start, 3 + p * 7) });
          due = next;
        }

        const title = (open && r() < 0.18 ? RISK_MARKER : '') + pick(TASKS);
        items.push({
          id: `${code}-${String(n).padStart(3, '0')}`,
          project,
          milestone,
          title,
          owner: pick(ROLES),
          status,
          points: pick([1, 2, 3, 5, 8, 13]),
          start_date: start,
          // A date nobody has confirmed stays blank by rule. Absence is data.
          due_date: r() < 0.12 ? null : due,
          due_history,
          updated_at: addDays(asOf, -Math.floor(r() * 45)) + 'T09:00:00Z',
        });
      }

      reports.push({
        project,
        milestone,
        rag: pick(RAG),
        reported_by: pick(ROLES),
        as_of: asOf,
      });
    }
  }
  return { asOf, items, reports };
}

// `node demo-data/generate.mjs` prints the data set, `--portfolio` the example 05 one
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = process.argv.includes('--portfolio') ? generatePortfolio() : generate();
  console.log(JSON.stringify(data, null, 2));
}
