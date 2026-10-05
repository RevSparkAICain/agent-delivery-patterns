# 01 canary-batch-readback

A batch job updates a tracker. Every write returns `ok: true`. This example shows why I never take that return value as proof, and what I check instead.

## Run it

```sh
node examples/01-canary-batch-readback/run.mjs                  # all three scenarios
node examples/01-canary-batch-readback/run.mjs --fault mapping  # wrong field mapping
node examples/01-canary-batch-readback/run.mjs --fault drop     # silently dropped write
node examples/01-canary-batch-readback/run.mjs --fault none     # clean run
```

No network, no keys, no dependencies. It finishes in about a second.

## What happens

The data is 24 synthetic tracker items across Project Alder, Project Birch and Project Cedar, plus a reviewed change plan of 17 updates. The "tracker" is a JSON file in a temp folder (`lib/store.mjs`), and it is deleted at the end of each run.

1. **Held writes.** Some items carry a recorded decision: a due date signed off by the Sponsor. Any planned change that would overturn one is held and routed to that owner. Nothing in the held queue gets written. With the default seed, five are held.
2. **Canary.** One write goes first, on the record with the most fields changing. The job reads it back and compares it field by field with the plan. If anything is off, the job stops there.
3. **Batch.** Each remaining item is written, read back and compared on its own. A record whose `updated_at` did not move gets one retry. Anything still failing is listed by id.
4. **Closing sweep.** Every record touched is re-read and compared with the plan again before a result is reported.

## The two faults

**Wrong field mapping** (`--fault mapping`). The write layer sends the due date to the tracker's "Start" column. The tracker accepts it and returns `ok`. The canary read-back shows the due date unchanged and the start date overwritten, so the job stops after one write and the other eleven never go out. Without the canary, all twelve would have been wrong in the same way, and every one would have reported success.

**Silent drop** (`--fault drop`). The store's fault mode makes the fifth write return `ok` without saving anything. The per-item read-back sees that the record's `updated_at` never changed, flags the write as failed, retries it, and the sweep confirms the result.

## Where the check lives

`verify()` in `run.mjs` is the whole idea in about twenty lines. It compares the record before and after the write against the plan, and it never looks at what the write call returned:

- `updated_at` unchanged: the write did not land.
- A planned field with the wrong value: the write landed in the wrong place, or not at all.
- An unplanned field that changed: the write landed somewhere it should not have.

## Tests

```sh
node --test
```

The tests cover the clean run, both faults, the held queue leaving recorded decisions untouched, and a direct check that an `ok` return is not trusted on its own.
