import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../demo-data/generate.mjs';
import { createStore } from '../lib/store.mjs';
import { runBatch, runScenario, verify, WRONG_MAP } from '../examples/01-canary-batch-readback/run.mjs';

test('generator is deterministic', () => {
  assert.deepEqual(generate(), generate());
});

test('clean run: every planned change verified, five held, sweep clean', () => {
  const r = runScenario('none');
  assert.equal(r.stage, 'done');
  assert.equal(r.held.length, 5);
  assert.equal(r.failed.length, 0);
  assert.equal(r.sweepIssues, 0);
  assert.equal(r.verified.length + r.held.length, generate().plan.length);
});

test('wrong mapping: canary read-back catches it and the batch never runs', () => {
  const r = runScenario('mapping');
  assert.equal(r.stage, 'canary');
  assert.ok(r.canaryIssues.some((i) => i.startsWith('due_date: expected')));
  assert.ok(r.canaryIssues.some((i) => i.startsWith('start_date: changed')));
  assert.equal(r.verified.length, 0);
  assert.ok(r.notSent > 0);
});

test('silent drop: caught by unchanged updated_at, recovered on retry', () => {
  const r = runScenario('drop');
  assert.equal(r.stage, 'done');
  assert.equal(r.recovered.length, 1);
  assert.equal(r.failed.length, 0);
  assert.equal(r.sweepIssues, 0);
});

test('held writes leave the recorded decision untouched', () => {
  const { records, plan } = generate();
  const dir = mkdtempSync(join(tmpdir(), 'adp-01-test-'));
  try {
    const store = createStore(join(dir, 'tracker.json'), records);
    const r = runBatch({ store, records, plan });
    for (const h of r.held) assert.equal(store.read(h.id)[h.field], h.recorded);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a write that returns ok is not trusted on its own', () => {
  const { records } = generate();
  const dir = mkdtempSync(join(tmpdir(), 'adp-01-test-'));
  try {
    const store = createStore(join(dir, 'tracker.json'), records, { dropWrite: 1 });
    const id = records[0].id;
    const before = store.read(id);
    const res = store.write(id, { [WRONG_MAP.owner]: 'Analyst' });
    assert.equal(res.ok, true);
    assert.match(verify(before, store.read(id), { owner: 'Analyst' })[0], /updated_at unchanged/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
