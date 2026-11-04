# 4. Plant Performance Center

Route `/performance`. For Managers. A read-only view of how the plant performs.

## Shows

- **Scope and range.** Site, one Area or one Line, and one of the four standard time ranges. Everything below follows them.
- **OEE.** The OEE value and its three parts, Availability, Performance and Quality, where OEE is the product of the three. Each shows the change against the previous range of the same length.
- **Downtime Pareto.** Downtime minutes per reason, sorted from largest to smallest, with the cumulative percentage. Reasons: Die change, Saw jam, Material shortage, Changeover, Vacuum loss, Weld fault, Tool change, Minor stops.
- **Output versus target.** Produced against target by hour (Last shift, Last 24 hours) or by day (Last 7 and Last 30 days).
- **Shift performance history.** The last 30 Shifts with OEE and output for each, and the best and worst marked.

## Actions

| Action | Effect |
|--------|--------|
| Change scope | Site, an Area or a Line. |
| Change range | One of the four standard ranges. |
| Select a Pareto reason | Highlights it and shows its minutes and share of total downtime. |

## States

- A scope and range with no production (for example a Line that did not run): empty state in each block.
- Last shift is the most recent completed Shift and does not change. Last 24 hours includes the current Shift and updates each tick. Longer ranges are fixed history.

## Required test IDs

`performance.scope`, `performance.range`, `performance.oee`, `performance.availability`, `performance.performance`, `performance.quality`, `performance.pareto`, `performance.pareto-reason`, `performance.output`, `performance.shift-history`, `performance.empty`.

## Out of scope

Drill-down to Batches, custom date ranges, exporting, setting targets.
