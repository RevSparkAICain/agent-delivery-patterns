// 01 canary-batch-readback
// Canary write, then batch with per-item read-back, then a closing sweep.
// Writes that would overturn a recorded decision are held for a named owner instead.
//
//   node examples/01-canary-batch-readback/run.mjs                  all three scenarios
//   node examples/01-canary-batch-readback/run.mjs --fault mapping  wrong field mapping
//   node examples/01-canary-batch-readback/run.mjs --fault drop     silently dropped write
//   node examples/01-canary-batch-readback/run.mjs --fault none     clean run
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generate } from '../../demo-data/generate.mjs';
import { createStore } from '../../lib/store.mjs';

// Plan field name -> tracker display label used in the write payload.
export const FIELD_MAP = { owner: 'Owner', status: 'Status', start_date: 'Start', due_date: 'Due' };
// The bug: due_date mapped to the "Start" column. Every write still returns ok.
export const WRONG_MAP = { ...FIELD_MAP, due_date: 'Start' };

const SKIP = new Set(['updated_at', 'decisions']);

// Compare the record as read back against the plan. Never trust the write's return value.
export function verify(before, after, set) {
  const issues = [];
  if (!after) return ['record missing on read-back'];
  if (after.updated_at === before.updated_at) {
    issues.push(`updated_at unchanged (${after.updated_at}): write returned ok, nothing was saved`);
    return issues;
  }
  for (const [field, want] of Object.entries(set)) {
    if (after[field] !== want) issues.push(`${field}: expected ${want}, found ${after[field]}`);
  }
  for (const field of Object.keys(after)) {
    if (!SKIP.has(field) && !(field in set) && after[field] !== before[field]) {
      issues.push(`${field}: changed from ${before[field]} to ${after[field]}, not in the plan`);
    }
  }
  return issues;
}

// A planned change that would overturn a recorded human decision goes to that decision's owner.
export function splitHeld(records, plan) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const held = [];
  const ready = [];
  for (const item of plan) {
    const conflict = byId.get(item.id).decisions.find(
      (d) => d.field in item.set && item.set[d.field] !== d.value,
    );
    if (conflict) held.push({ ...item, field: conflict.field, recorded: conflict.value, owner: conflict.by });
    else ready.push(item);
  }
  return { held, ready };
}

const toPayload = (set, map) => Object.fromEntries(Object.entries(set).map(([f, v]) => [map[f], v]));

export function runBatch({ store, records, plan, fieldMap = FIELD_MAP, log = () => {} }) {
  const { held, ready } = splitHeld(records, plan);
  for (const h of held) {
    log(`  held    ${h.id} ${h.field}: recorded ${h.recorded} (${h.owner} decision), plan says ${h.set[h.field]}. Routed to ${h.owner}.`);
  }

  const apply = (item) => {
    const before = store.read(item.id);
    const res = store.write(item.id, toPayload(item.set, fieldMap));
    return { res, issues: res.ok ? verify(before, store.read(item.id), item.set) : [res.error] };
  };

  // Canary: the hardest record (most fields changed) goes first, alone.
  const canary = ready.reduce((a, b) => (Object.keys(b.set).length > Object.keys(a.set).length ? b : a));
  const c = apply(canary);
  log(`  canary  ${canary.id} write returned ok=${c.res.ok}, read-back ${c.issues.length ? 'FAILED' : 'passed'}`);
  for (const i of c.issues) log(`            ${i}`);
  if (c.issues.length) {
    const notSent = ready.length - 1;
    log(`  stopped after the canary: 1 write made, ${notSent} never sent, ${held.length} held`);
    log(`  without the canary, all ${notSent + 1} writes would have gone out the same way, each one returning ok`);
    return { stage: 'canary', canary: canary.id, canaryIssues: c.issues, held, verified: [], failed: [], recovered: [], notSent, swept: 0 };
  }

  // Batch: each item verifies itself; an unchanged record gets one retry.
  const verified = [canary];
  const failed = [];
  const recovered = [];
  for (const item of ready.filter((x) => x !== canary)) {
    let r = apply(item);
    if (r.issues.length) {
      log(`  batch   ${item.id} write returned ok=${r.res.ok}, read-back FAILED`);
      for (const i of r.issues) log(`            ${i}`);
      if (r.issues.every((i) => i.startsWith('updated_at unchanged'))) {
        r = apply(item);
        if (!r.issues.length) { recovered.push(item.id); log(`  retry   ${item.id} read-back passed, recovered`); }
      }
    }
    if (r.issues.length) failed.push({ id: item.id, issues: r.issues });
    else verified.push(item);
  }

  // Closing sweep: re-read everything touched, compare to the plan again.
  let sweepIssues = 0;
  for (const item of verified) {
    const rec = store.read(item.id);
    for (const [f, v] of Object.entries(item.set)) if (rec[f] !== v) sweepIssues++;
  }
  log(`  sweep   re-read ${verified.length} records, ${sweepIssues} mismatches`);
  log(`  result  ${verified.length} verified, ${recovered.length} recovered, ${failed.length} failed, ${held.length} held for owners, ${store.writes} writes made`);
  return { stage: 'done', canary: canary.id, held, verified: verified.map((v) => v.id), failed, recovered, notSent: 0, swept: verified.length, sweepIssues };
}

export const SCENARIOS = {
  none: { title: 'clean run', fieldMap: FIELD_MAP, dropWrite: 0 },
  mapping: { title: 'wrong field mapping (due date written to the start date column)', fieldMap: WRONG_MAP, dropWrite: 0 },
  drop: { title: 'silent drop (the 5th write returns ok and saves nothing)', fieldMap: FIELD_MAP, dropWrite: 5 },
};

export function runScenario(name, log = () => {}) {
  const s = SCENARIOS[name];
  if (!s) throw new Error(`unknown --fault ${name}, use one of: ${Object.keys(SCENARIOS).join(', ')}`);
  const { records, plan } = generate();
  const dir = mkdtempSync(join(tmpdir(), 'adp-01-'));
  try {
    const store = createStore(join(dir, 'tracker.json'), records, { dropWrite: s.dropWrite });
    log(`\nScenario: ${s.title}`);
    log(`  plan    ${plan.length} changes across ${records.length} synthetic records`);
    return runBatch({ store, records, plan, fieldMap: s.fieldMap, log });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--fault');
  const names = i > -1 ? [process.argv[i + 1]] : ['none', 'mapping', 'drop'];
  for (const n of names) runScenario(n, console.log);
}
