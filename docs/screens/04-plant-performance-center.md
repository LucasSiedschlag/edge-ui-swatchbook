# 4. Plant Performance Center

Route `/performance`. For Managers. A read-only view of how the plant performs.

## Shows

- **Scope and range.** Site, one Area or one Line, and one of the four standard time ranges. Everything below follows them.
- **OEE.** The OEE value and its three parts, Availability, Performance and Quality, where OEE is the product of the three. Each shows the change against the previous range of the same length, in percentage points of the 0 to 100 scale.
- **Downtime Pareto.** Downtime minutes per reason, sorted from largest to smallest, with the cumulative percentage. Reasons: Die change, Saw jam, Material shortage, Changeover, Vacuum loss, Weld fault, Tool change, Minor stops.
- **Output versus target.** Produced as good units plus scrap, with a separate ideal target, by hour (Last shift, Last 24 hours) or by day (Last 7 and Last 30 days).
- **Shift performance history.** The last 30 Shifts with OEE and output for each, and the best and worst marked. Equal values choose the earliest Shift; no marks appear when all values are equal or fewer than two Shifts exist.

## Actions

| Action | Effect |
|--------|--------|
| Change scope | Site, an Area or a Line. |
| Change range | One of the four standard ranges. |
| Select a Pareto reason | Highlights it and shows its minutes and share of total downtime. |

## States

- A scope and range with no units and no run minutes: one whole Screen `performance.empty` element when `hasProduction` is false, since all blocks are empty together. If the previous range has no production, the OEE comparison is empty. Quality is empty when no units were made.
- Last shift is the most recent completed Shift and does not change; Last 24 hours includes the current Shift and updates each tick; Last 7 and Last 30 days are fixed history up to load and do not change during the session.

## Required test IDs

`performance.scope`, `performance.range`, `performance.oee`, `performance.availability`, `performance.performance`, `performance.quality`, `performance.pareto`, `performance.pareto-reason`, `performance.output`, `performance.shift-history`, `performance.empty`.

## Out of scope

Drill-down to Batches, custom date ranges, exporting, setting targets.
