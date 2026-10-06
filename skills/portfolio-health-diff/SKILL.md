---
name: portfolio-health-diff
description: Run and explain the portfolio health read. Use when asked to demo health computed from behaviour against self-reported status, show why percent complete depends on the denominator, show "Blocked" inflating work in flight, or show a reconciliation broken by its join.
---

# Portfolio health diff

Example 05 in this repo. Everything is synthetic and local. There is no network access and nothing to configure.

## Run

From the repo root:

- `node examples/05-portfolio-health-diff/run.mjs` runs all four scenarios.
- `--fault none` is the honest read: computed health reconciled against reported status, printing only the disagreements.
- `--fault denominator` shows the same work reporting three different percentages.
- `--fault started` shows "Blocked" counted as a started state inflating work in flight.
- `--fault join` shows a join on milestone name alone matching every row, agreeing on the total, and being wrong about which rows.
- `node --test` runs the tests.
- `node demo-data/generate.mjs --portfolio` prints the data set.

## When explaining the output

- **computed health:** derived only from behaviour - overdue, staleness, due-date drift, blank dates, the team's title marker, and cancelled share. It never reads the reported colour.
- **gap:** a milestone where the computed read and the owner's report disagree. The direction matters: *reported better than it behaves* is the expensive one.
- **reasons:** the rows that caused the colour, so any call can be traced back.
- **agenda:** only the gaps. A review that walks every milestone is not using the read.

The point to make: a status field filled in by the person being measured is a self-assessment. The computed read is not better because it is automated, it is better because it is independent. The finding is the divergence, not either number.

## The three measurement traps

- **Denominator.** Cancelled work leaves the denominator, so a milestone can climb toward 100 percent by cancelling what remains. Count by items, by items minus cancellations, and by estimate points, and say which one you used.
- **Started.** Whether "Blocked" counts as started is workspace configuration, not fact. Audit what the tool thinks "started" means before trusting any rollup.
- **Join.** An almost-right join produces confident, wrong reconciliation. Watch for the case where the loose join reports the same total as the correct one.

## Rules

- Do not add network calls, API clients or real tracker data to this example.
- Keep every record synthetic, generated from `demo-data/seed.json`.
- Do not change `generate()` in `demo-data/generate.mjs`; example 01 asserts exact counts against it. This example uses `generatePortfolio()`.
