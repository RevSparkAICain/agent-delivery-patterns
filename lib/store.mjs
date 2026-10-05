// A local JSON file that plays the "system of record" (a tracker).
// Writes use the tracker's display labels, the way an import or API payload would.
// Fault mode: `dropWrite: n` makes the nth write return { ok: true } without saving anything.
import { readFileSync, writeFileSync } from 'node:fs';

export const LABELS = { Owner: 'owner', Status: 'status', Start: 'start_date', Due: 'due_date' };

export function createStore(file, records, { dropWrite = 0, clockStart = '2026-10-05T09:00:00Z' } = {}) {
  writeFileSync(file, JSON.stringify(records, null, 2));
  let writes = 0;
  let clock = Date.parse(clockStart); // fixed fake clock so every run prints the same timestamps
  const load = () => JSON.parse(readFileSync(file, 'utf8'));

  return {
    get writes() { return writes; },
    read(id) { return load().find((r) => r.id === id) ?? null; },
    write(id, payload) {
      writes++;
      if (writes === dropWrite) return { ok: true, id }; // the silent drop
      const all = load();
      const rec = all.find((r) => r.id === id);
      if (!rec) return { ok: false, id, error: 'not found' };
      const unknown = Object.keys(payload).filter((label) => !LABELS[label]);
      if (unknown.length) return { ok: false, id, error: `unknown field ${unknown.join(', ')}` };
      for (const [label, value] of Object.entries(payload)) rec[LABELS[label]] = value;
      clock += 1000;
      rec.updated_at = new Date(clock).toISOString().replace('.000', '');
      writeFileSync(file, JSON.stringify(all, null, 2));
      return { ok: true, id };
    },
  };
}
