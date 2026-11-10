# 4. Plant Performance Center

Route `/performance`. For Managers. A read-only view of how the plant performs.

## Shows

- **Scope and range.** Site, one Area or one Line, and one of the four standard time ranges. Everything below follows them. Defaults are Site and Last shift, exported as `PERFORMANCE_DEFAULT_SCOPE` and `PERFORMANCE_DEFAULT_RANGE` from core.
- **OEE.** The OEE value and its three parts, Availability, Performance and Quality, where OEE is the product of the three. Each shows the change against the previous range of the same length, in percentage points of the 0 to 100 scale, formatted with an explicit sign and the unit `pp`.
- **Downtime Pareto.** Downtime minutes per reason, sorted from largest to smallest, with the cumulative percentage. Minutes use the core unit precision for `min` consistently in ticks, lists, tooltips and the accessible data table. Cumulative axis ticks use zero decimal places; percentage details keep one decimal. Reasons: Die change, Saw jam, Material shortage, Changeover, Vacuum loss, Weld fault, Tool change, Minor stops.
- **Output versus target.** Produced as good units plus scrap, with a separate ideal target, by hour (Last shift, Last 24 hours) or by day (Last 7 and Last 30 days). The value axis is named Units. Hourly ticks show time only; daily ticks show date only, with automatic tick density and overlapping labels hidden. Tooltips and the accessible data table retain full date-time labels. The Hour or Day axis name sits centered below the tick labels with a separate gap.
- **Shift performance history.** The last 30 Shifts with OEE and output for each, and the best and worst marked. Equal values choose the earliest Shift; no marks appear when all values are equal or fewer than two Shifts exist.

## Actions

| Action | Effect |
|--------|--------|
| Change scope | Site, an Area or a Line. |
| Change range | One of the four standard ranges. |
| Select a Pareto reason | Highlights it and shows its minutes and share of total downtime in a labeled selected-reason summary, separated from the buttons by native spacing. The summary uses native labeled descriptions, with no live region. |

## States

- A scope and range with no units and no run minutes: one whole Screen `performance.empty` element when `hasProduction` is false, since all blocks are empty together. If the previous range has no production, the OEE comparison is empty. Quality is empty when no units were made. Previous Quality has its own message when the previous range has run minutes but no units. Output shows its empty state instead of a chart when `outputHasUnits` is false.
- Last shift is the most recent completed Shift and does not change; Last 24 hours includes the current Shift and updates each tick; Last 7 and Last 30 days are fixed history up to load and do not change during the session.

## Required test IDs

`performance.scope`, `performance.range`, `performance.oee`, `performance.availability`, `performance.performance`, `performance.quality`, `performance.pareto`, `performance.pareto-reason`, `performance.output`, `performance.shift-history`, `performance.empty`.

## Out of scope

Drill-down to Batches, custom date ranges, exporting, setting targets.
