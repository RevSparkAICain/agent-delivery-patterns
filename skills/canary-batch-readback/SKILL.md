---
name: canary-batch-readback
description: Run and explain the canary, batch and read-back example. Use when asked to demo verified batch writes, show a silent write drop or a wrong field mapping being caught, or explain the held-writes queue.
---

# Canary, batch, read-back

Example 01 in this repo. Everything is synthetic and local. There is no network access and nothing to configure.

## Run

From the repo root:

- `node examples/01-canary-batch-readback/run.mjs` runs the clean run and both faults.
- `--fault mapping` shows the canary catching a wrong field mapping after one write.
- `--fault drop` shows a write that returned ok being caught by its unchanged `updated_at`, then recovered.
- `node --test` runs the tests.

## When explaining the output

- **held:** a planned change that would overturn a recorded decision. It goes to the named owner and is never written.
- **canary:** the first write, on the record with the most fields changing, read back field by field before anything else moves.
- **batch:** each item is written, read back and compared with the plan on its own.
- **sweep:** every touched record is re-read and compared again before the result is reported.

The point to make: the write's return value is a claim. The record read back from the system of record is the evidence.

## Rules

- Do not add network calls, API clients or real tracker data to this example.
- Keep every record synthetic, generated from `demo-data/seed.json`.
