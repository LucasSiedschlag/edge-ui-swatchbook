import type { MessageKey } from '../messages';

// Shared by spec coverage and Library rendering tests.
type Elements = Record<string, readonly MessageKey[]>;
export const controlCoverage = {
  file: "06-control-room-command.md",
  shows: {
    "Active alarm list": [
      "control.alarms", "control.alarm-priority", "control.alarm-state", "scope.line",
      "term.machine", "common.message", "control.alarm-raised", "common.age",
      "control.alarm-acknowledged-by", "control.select-alarm",
    ],
    "Event Log": [
      "term.event-log", "common.time", "control.event-user", "control.event-role",
      "control.event-action", "control.event-target", "control.event-target-kind", "control.event-old-value",
      "control.event-new-value", "control.event-note", "common.change", "control.event-range",
    ],
    "Communication diagnostics": [
      "control.diagnostics", "term.machine", "parameters.link-status", "control.diagnostics-latency",
      "control.diagnostics-packet-loss", "control.diagnostics-heartbeat", "control.diagnostics-error-count", "control.diagnostics-empty",
    ],
  },
  actions: {
    "Filter Alarms": [
      "control.filter-alarms", "control.alarm-priority", "control.alarm-state", "scope.area",
      "scope.line", "control.alarm-state-open",
    ],
    "Acknowledge": [
      "action.alarm-acknowledge", "control.select-all-alarms",
    ],
    "Filter the Event Log": [
      "control.filter-events", "control.event-user", "control.event-action", "control.event-range",
    ],
    "Sort diagnostics": [
      "control.diagnostics-sort", "common.sort", "parameters.link-status", "control.diagnostics-latency",
      "control.diagnostics-packet-loss", "term.machine",
    ],
  },
  states: {
    "No active Alarms with no filters: `control.alarm-empty`. With any filter set, including Cleared only: `control.alarm-empty-filtered`.": [
      "control.alarm-empty", "control.alarm-empty-filtered",
    ],
    "Event Log filter with no match: empty state.": [
      "control.event-empty",
    ],
    "Offline Machine: shown first in diagnostics and linked to its Alarm if one exists. Opening the link clears Alarm filters, scrolls to and focuses its Alarm row without changing the selection.": [
      "link-status.offline", "control.open-machine-alarm",
    ],
    "Acknowledging an Alarm that is already acknowledged: no change, no log entry.": [
      "control.already-acknowledged",
    ],
  },
} as const satisfies { file: string; shows: Elements; actions: Elements; states: Elements };
