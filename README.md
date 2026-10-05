# agent-delivery-patterns

Small, runnable examples that go with my LinkedIn series on running delivery with governed AI agent teams.

Each example shows one mechanism from the series and then breaks it on purpose, so you can watch the check catch the failure the post describes. Each one runs in under a minute with plain Node: no accounts, no keys, no network, no dependencies.

## Run

You need Node.js (current LTS).

```sh
node examples/01-canary-batch-readback/run.mjs
node --test
```

## Examples

| # | Example | What it shows | Series posts | Status |
|---|---|---|---|---|
| 01 | [canary-batch-readback](examples/01-canary-batch-readback/) | A canary write checked field by field, a batch where each item reads itself back, a closing sweep, and a held queue for writes that would overturn a recorded decision | Week 1 | Available |
| 02 | resumable-job | A long job that saves state after every item and resumes at the missing item after it is killed | Weeks 7 and 8 | Coming before the first Friday live session |
| 03 | build-vs-run | When to have a model write a program once instead of paying for inference on every run | Week 3 | Coming |
| 04 | versioned-skill-release | A skill registry with a release queue, readiness gates and a hash-checked install step | Weeks 3 and 7 | Coming before the first Friday live session |
| 05 | portfolio-health-diff | Health computed from behavior, compared with self-reported status, with output only where they disagree | Weeks 2, 4, 5 and 6 | Coming before the first Friday live session |

## Layout

```text
demo-data/   seeded generator and seed, so every run is identical
lib/         store.mjs: a local JSON file that plays the system of record, with an opt-in fault mode
examples/    one folder per example, each with run.mjs and a README
skills/      one SKILL.md per example, so Claude Code can drive it
tests/       one test file per example, run with node --test
```

## About the data

Everything here is synthetic. Records come from a seeded generator, projects have invented names like Project Alder and Project Birch, and people appear only as role labels such as Sponsor or Delivery lead. Nothing in this repo connects to a real tracker, chat or document system.

## License

MIT. See [LICENSE](LICENSE).
