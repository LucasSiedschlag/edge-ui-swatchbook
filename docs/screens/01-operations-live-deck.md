# 1. Operations Live Deck

Route `/deck`. For Operators on shift. Shows the state of one Line and lets the Operator act on it.

## Shows

- **Line selector.** Any of the 7 Lines. The default is E1.
- **Line status.** Running, Stopped or Alarm, with the reason when Stopped (Paused by operator, Emergency stop, Fault). A Line is Alarm while it has an active Critical Alarm. Otherwise it is Running or Stopped.
- **Active Batch.** Batch ID, Lot, Product, Recipe Version, start time, elapsed time, and produced versus target count with percentage.
- **Live KPIs** from the Simulator, updated each tick: OEE, output count this Shift, cycle time versus takt (Assembly) or line speed (Extrusion), and scrap count.
- **Critical alarm banner.** Minimized by default, showing the number of active Critical Alarms on the Line. Expanding it lists them with Machine, message and age.
- **Current Shift** with name and time left.

## Actions

| Action | Effect |
|--------|--------|
| Pause | Line goes Stopped, reason Paused by operator. Logged. |
| Resume | Line goes Running if it has no active Critical Alarm. Logged. |
| Emergency stop | Needs a confirmation. Line goes Stopped, reason Emergency stop, and stays latched until Reset. Logged. |
| Reset | Clears the latch after an Emergency stop. Logged. |
| Shift handover | Asks for a note, records it on the current Shift. Logged. |
| Expand or collapse banner | Shows or hides the Critical Alarms. |

## States

- Running, Stopped (three reasons), Alarm.
- No active Batch on the Line: the Batch block shows an empty state.
- No Critical Alarms: the banner shows zero and cannot expand.

## Required test IDs

`deck.line-select`, `deck.line-status`, `deck.stop-reason`, `deck.batch`, `deck.batch-progress`, `deck.kpi-oee`, `deck.kpi-output`, `deck.kpi-cycle`, `deck.kpi-scrap`, `deck.alarm-banner`, `deck.pause`, `deck.resume`, `deck.estop`, `deck.estop-confirm`, `deck.reset`, `deck.handover`, `deck.handover-note`, `deck.shift`.

## Out of scope

Acknowledging Alarms (Screen 6), editing Recipes, trends.
