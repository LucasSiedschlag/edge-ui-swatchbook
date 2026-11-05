# 5. Live Parameter Matrix

Route `/parameters`. For Technicians. Raw Tags, live trends, setpoint changes and device connectivity.

## Shows

- **Tag grid.** About 300 Tags with Line, Machine, Tag name, current value, unit, setpoint, minimum, maximum and status (Normal, High, Low or Stale). Values update each tick.
- **Trend.** Up to 4 selected Tags drawn together over one of three live windows: Last 5 minutes, Last 30 minutes, Last 2 hours. For example barrel zone temperature against die pressure.
- **Connectivity.** Every Machine with its link status (Online, Degraded or Offline) and last-seen time. Tags of an Offline Machine show Stale and stop updating.

## Actions

| Action | Effect |
|--------|--------|
| Filter | By Line, Machine, status and Tag name search. |
| Select Tags for the trend | Up to 4. A fifth shows a message and does nothing. |
| Change trend window | One of the three live windows. |
| Setpoint Override | On a writable Tag, set a new setpoint with a required reason. A value outside minimum and maximum is rejected with an error. A valid override applies from the tick it is made and logged, earlier ticks never change. |
| Reset to recipe value | Restores the setpoint of the active Recipe Version. Logged. |

## States

- Tag out of limits: High or Low, and shown as such.
- Stale Tag on an Offline Machine: no Setpoint Override allowed.
- No Tag matches the filter: empty state.
- No Tag selected for the trend: empty state asking to select Tags.

## Required test IDs

`parameters.grid`, `parameters.filter-line`, `parameters.filter-machine`, `parameters.filter-status`, `parameters.search`, `parameters.tag-select`, `parameters.trend`, `parameters.trend-window`, `parameters.trend-limit`, `parameters.override`, `parameters.override-value`, `parameters.override-reason`, `parameters.override-error`, `parameters.override-apply`, `parameters.reset-recipe`, `parameters.connectivity`, `parameters.empty`.

## Out of scope

Trend zoom and export, scaling per Tag, alarm limits editing, historian queries.
