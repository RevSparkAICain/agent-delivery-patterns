# 05 portfolio-health-diff

Every project milestone carries a status its owner chose. This example computes a second read from how the work actually behaves, reconciles the two, and prints only the milestones where they disagree. Then it shows three ways the same tracker reports a different number.

## Run it

```sh
node examples/05-portfolio-health-diff/run.mjs                      # all four scenarios
node examples/05-portfolio-health-diff/run.mjs --fault none         # the honest read
node examples/05-portfolio-health-diff/run.mjs --fault denominator  # percent complete, three ways
node examples/05-portfolio-health-diff/run.mjs --fault started      # "Blocked" counted as started
node examples/05-portfolio-health-diff/run.mjs --fault join         # a join that is almost right
```

No network, no keys, no dependencies. It finishes in about a second.

## The data

50 synthetic items across Project Alder, Project Birch and Project Cedar, each item on one of six standard milestones, plus 18 self-reported statuses - one per project milestone, attributed to a role. Items carry an estimate, a start date, a due date that may be blank, and a `due_history` recording every time that date was pushed out. Generated from `demo-data/seed.json`, so every run is identical.

## The honest read

`computeHealth()` never looks at the reported colour. It counts behaviour:

- **overdue** - open and past the date it carries.
- **stale** - open and untouched for more than 21 days.
- **drift** - total days the due date has been pushed, summed over every recorded move.
- **blank due date** - nobody confirmed it. That is a finding, not a row to skip.
- **marked** - the team's own risk convention, which in this data lives in the item title rather than the status field.
- **cancelled** - work that left the denominator. It still counts against the outcome.

Those produce a colour and a list of reasons, so every call is traceable to the rows that caused it. The reconciliation then prints only the disagreements, with the direction named: an owner reporting better than the work behaves is the case that costs you.

With the default seed, 11 of 18 milestones disagree and 8 of those 11 were reported better than they behave. The other 7 need no meeting.

## Why a closed milestone is not automatically Green

A milestone with nothing open is Green only if the work shipped. If half of it or more was cancelled, the read stays Amber and says so. Cancelling the remainder closes a milestone; it does not deliver it. The first version of this example returned Green for a milestone that was two-thirds cancelled, which is exactly the failure the next scenario is about.

## The three scenarios that move the number

**Percent complete** (`--fault denominator`). The same work reports three different figures: by item count with cancelled work in the denominator, by item count with it removed, and by estimate points. On this seed one milestone reads 33.3 percent or 100 percent depending only on whether two cancelled items stay in the denominator. Nothing was delivered between those two numbers. Across the whole portfolio the three reads are 30, 39.5 and 42.7 percent on the same 50 items.

**Started** (`--fault started`). "Blocked" means waiting on somebody else. Whether a workspace counts it as a started state is a configuration choice. Here it moves work in flight from 10 to 17, so 41 percent of the reported load is work that has not begun. Every capacity read built on the larger number overstates the team.

**The join** (`--fault join`). Milestone names repeat across projects, so joining the reports to the computed read on milestone name alone still matches all 18 rows and still reports 11 disagreements. The total is identical to the correct join. Underneath it, 10 reports were compared against a different project's work, 2 real gaps went unreported and 2 were invented. A reconciliation whose headline matches is the one nobody checks.

## Tests

```sh
node --test
```

The tests cover the determinism of the data, each behaviour signal on its own, the cancelled-is-not-Green rule, percent complete climbing on cancellation alone, blocked-as-started, and the loose join agreeing on the total while being wrong about the rows.
