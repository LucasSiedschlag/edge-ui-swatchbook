# 6. Control Room Command

Route `/control`. Alarms, the Event Log and communication diagnostics.

## Shows

- **Active alarm list.** Priority (Critical, High, Medium, Low), state, Line, Machine, message, raised time and age. Sorted by priority, then by raised time. Alarm states: active unacknowledged, active acknowledged, returned to normal unacknowledged, cleared.
- **Event Log.** Chronological, newest first: time, User, Role, action, target, and old value to new value where one applies. It includes Alarm acknowledgements, Setpoint Overrides, Pause, Emergency stop, Shift handovers and Recipe changes.
- **Communication diagnostics.** For every Machine: link status (Online, Degraded or Offline), latency in ms, packet loss percentage, last heartbeat and error count.

## Actions

| Action | Effect |
|--------|--------|
| Filter Alarms | By priority, state, Area and Line. |
| Acknowledge | One or several selected Alarms, with `a` or a button. An active unacknowledged Alarm becomes active acknowledged. A returned to normal unacknowledged Alarm becomes cleared. Logged. |
| Filter the Event Log | By User, action type and time range (the four standard ranges); default range: Last 24 hours. Last shift is the most recent completed Shift at load and stays fixed. Last 24 hours, Last 7 days and Last 30 days keep rolling. |
| Sort diagnostics | By status severity (Offline, Degraded, Online), latency, packet loss or Machine id. Default is severity then Machine id. Explicit sorts put null latency last in both directions and break ties by Machine id ascending. |

## States

- No active Alarms with no filters: `control.alarm-empty`. With any filter set, including Cleared only: `control.alarm-empty-filtered`.
- Event Log filter with no match: empty state.
- Offline Machine: shown first in diagnostics and linked to its Alarm if one exists. Opening the link clears Alarm filters, scrolls to and focuses its Alarm row without changing the selection.
- Acknowledging an Alarm that is already acknowledged: no change, no log entry.

## Required test IDs

`control.alarm-list`, `control.alarm-row`, `control.alarm-filter-priority`, `control.alarm-filter-state`, `control.alarm-filter-area`, `control.alarm-filter-line`, `control.alarm-select`, `control.acknowledge`, `control.alarm-empty`, `control.event-log`, `control.event-filter-user`, `control.event-filter-type`, `control.event-filter-range`, `control.event-empty`, `control.diagnostics`, `control.diagnostics-sort`.

## Out of scope

Shelving or suppressing Alarms, editing alarm limits, remote diagnostics commands, printing the Event Log.
