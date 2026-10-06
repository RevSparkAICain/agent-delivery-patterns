import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePortfolio, RISK_MARKER } from '../demo-data/generate.mjs';
import {
  computeAll, computeHealth, driftDays, inFlight, progress, reconcile, runScenario, STALE_DAYS,
} from '../examples/05-portfolio-health-diff/run.mjs';

const AS_OF = '2026-11-16';
// A fresh, open, on-time item with nothing wrong with it.
const ok = (over = {}) => ({
  id: 'X-001', project: 'Project Alder', milestone: 'Build', title: 'Draft test plan',
  owner: 'Analyst', status: 'In progress', points: 3, start_date: '2026-10-12',
  due_date: '2026-12-01', due_history: [], updated_at: '2026-11-15T09:00:00Z', ...over,
});

test('portfolio generator is deterministic', () => {
  assert.deepEqual(generatePortfolio(), generatePortfolio());
});

test('a clean milestone is Green with no reasons', () => {
  const h = computeHealth([ok(), ok({ id: 'X-002' })], AS_OF);
  assert.equal(h.rag, 'Green');
  assert.deepEqual(h.reasons, []);
});

test('health reads the team risk marker in the title, not the status field', () => {
  const h = computeHealth([ok({ title: RISK_MARKER + 'Run user training' })], AS_OF);
  assert.equal(h.rag, 'Red');
  assert.match(h.reasons.join(' '), /flagged by the team in the title/);
});

test('a blank due date is a finding, not a row to skip', () => {
  const h = computeHealth([ok({ due_date: null })], AS_OF);
  assert.equal(h.rag, 'Amber');
  assert.equal(h.signals.blankDue, 1);
});

test('staleness is measured against as-of, not the item order', () => {
  const stale = computeHealth([ok({ updated_at: '2026-09-01T09:00:00Z' })], AS_OF);
  assert.equal(stale.signals.stale, 1);
  const fresh = computeHealth([ok({ updated_at: '2026-11-10T09:00:00Z' })], AS_OF);
  assert.equal(fresh.signals.stale, 0);
  assert.ok(STALE_DAYS > 0);
});

test('drift sums every recorded push of the due date', () => {
  const item = ok({ due_history: [{ from: '2026-11-01', to: '2026-11-08' }, { from: '2026-11-08', to: '2026-11-20' }] });
  assert.equal(driftDays(item), 19);
  assert.equal(computeHealth([item], AS_OF).rag, 'Amber');
});

test('closing a milestone by cancelling the rest is not Green', () => {
  const cancelled = computeHealth([ok({ status: 'Done' }), ok({ id: 'X-002', status: 'Cancelled' })], AS_OF);
  assert.equal(cancelled.signals.open, 0);
  assert.equal(cancelled.rag, 'Amber', 'cancelled work left the denominator but not the outcome');
  assert.match(cancelled.reasons.join(' '), /cancelled rather than delivered/);

  const delivered = computeHealth([ok({ status: 'Done' }), ok({ id: 'X-002', status: 'Done' })], AS_OF);
  assert.equal(delivered.rag, 'Green');
});

test('cancelling the remainder raises percent complete without delivering anything', () => {
  const items = [ok({ status: 'Done' }), ok({ id: 'X-002', status: 'In progress' }), ok({ id: 'X-003', status: 'In progress' })];
  const before = progress(items);
  const after = progress([items[0], { ...items[1], status: 'Cancelled' }, { ...items[2], status: 'Cancelled' }]);
  assert.equal(before.done, after.done, 'the same single item is Done in both reads');
  assert.ok(after.byCountLive > before.byCountLive, `${before.byCountLive}% climbed to ${after.byCountLive}%`);
  assert.equal(after.byCountLive, 100);
  assert.equal(after.byCountAll, before.byCountAll, 'keeping cancelled work in the denominator does not move');
});

test('counting "Blocked" as started inflates work in flight', () => {
  const items = [ok(), ok({ id: 'X-002', status: 'Blocked' }), ok({ id: 'X-003', status: 'Blocked' })];
  assert.equal(inFlight(items, { blockedCountsAsStarted: false }), 1);
  assert.equal(inFlight(items, { blockedCountsAsStarted: true }), 3);
});

test('the honest read only reports milestones where the two disagree', () => {
  const r = runScenario('none');
  assert.ok(r.gaps.length > 0);
  assert.ok(r.gaps.length < r.matched, 'a read that disagrees everywhere is not a read');
  assert.ok(r.optimistic > 0, 'some owners report better than their work behaves');
  for (const g of r.gaps) assert.notEqual(g.reported, g.computed);
});

test('reconciliation matches a report to its own project', () => {
  const { asOf, items, reports } = generatePortfolio();
  const computed = computeAll(items, asOf);
  const { gaps, matched } = reconcile(computed, reports);
  assert.equal(matched, reports.length);
  for (const g of gaps) assert.equal(g.comparedWith, `${g.project} / ${g.milestone}`);
});

test('a join on milestone name alone agrees on the total and is wrong about the rows', () => {
  const r = runScenario('join');
  assert.equal(r.strict.matched, r.loose.matched, 'both joins match every report, so neither looks broken');
  assert.ok(r.wrongAttributions > 0, 'the loose join compared reports against another project');
  assert.ok(r.missed.length > 0, 'it missed real gaps');
  assert.ok(r.invented.length > 0, 'it invented gaps that are not there');
  // This seed produces the dangerous case: an identical headline over different rows.
  assert.equal(r.strict.gaps.length, r.loose.gaps.length);
});

test('every scenario runs and reports', () => {
  for (const name of ['none', 'denominator', 'started', 'join']) {
    assert.ok(runScenario(name), name);
  }
  assert.throws(() => runScenario('nope'), /unknown --fault/);
});
