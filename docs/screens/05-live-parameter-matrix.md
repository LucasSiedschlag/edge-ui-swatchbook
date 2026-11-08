# 5. Live Parameter Matrix

Route `/parameters`. For Technicians. Raw Tags, live trends, setpoint changes and device connectivity.

## Shows

- **Tag grid.** About 300 Tags with Line, Machine, Tag name, current value, unit, setpoint, minimum, maximum and status (Normal, High, Low or Stale). Values update each tick.
- **Trend.** Up to 4 selected Tags drawn together over one of three live windows: Last 5 minutes, Last 30 minutes, Last 2 hours. Up to 4 different units use separate offset Y axes; each Tag's limits and setpoint use its own unit axis. For example barrel zone temperature against die pressure. Screens must pass their Plant State Overlay to `trendView`.
- **Connectivity.** Every Machine with its link status (Online, Degraded or Offline) and last-seen time. Tags of an Offline Machine show Stale and stop updating.

The shared defaults are `TAG_GRID_DEFAULT_FILTERS` (no filters) and `DEFAULT_TREND_WINDOW` (`5m`). The grid preserves dataset order and does not sort. `trendView` includes each selected Tag's name, Machine id, unit, minimum and maximum; `tagDetailView` supplies current dialog details independently of filters and virtualization.

Selection checkboxes use `parameters.select-tag` and `parameters.select-all-tags`, including the native select-all checkbox. Reset to recipe displays `parameters.recipe-value` with the view's recipe value. Disabled actions expose the core refusal reason.

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
- No Tag matches the filter: `parameters.grid-empty`.
- No Tag selected for the trend: `parameters.trend-empty` asks to select Tags.
- If the whole Screen has no content, show one `parameters.empty` instead of the block empty states.

## Required test IDs

`parameters.grid`, `parameters.filter-line`, `parameters.filter-machine`, `parameters.filter-status`, `parameters.search`, `parameters.tag-select`, `parameters.trend`, `parameters.trend-window`, `parameters.trend-limit`, `parameters.override`, `parameters.override-value`, `parameters.override-reason`, `parameters.override-error`, `parameters.override-apply`, `parameters.reset-recipe`, `parameters.connectivity`, `parameters.empty`, `parameters.grid-empty`, `parameters.trend-empty`.

## Out of scope

Trend zoom and export, scaling per Tag, alarm limits editing, historian queries.
