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

// `node demo-data/generate.mjs` prints the data set
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(generate(), null, 2));
}
