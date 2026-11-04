# 3. Batch & Lot Ledger

Route `/ledger`. A dense grid of historical Batches, for finding and comparing runs.

## Shows

About 5,000 Batches, one per row, with these columns: Batch ID, Lot, Upstream Lot, Area, Line, Product, Recipe Version, Shift, start, end, duration, status (Completed, Aborted or Rework), yield percentage and scrap count.

## Actions

| Action | Effect |
|--------|--------|
| Sort | By any column. |
| Filter by column | Text for IDs, choice lists for Area, Line, Product, Shift and status, ranges for yield, scrap and duration, a date range for start. Filters combine. |
| Clear filters | Resets every filter and shows the row count. |
| Select rows | Multi-select with checkboxes, up to 4 Batches. Selecting a fifth shows a message and does nothing. |
| Compare | With 2 to 4 Batches selected, shows their duration, yield, scrap and key Parameter actuals side by side. |
| Open details | Opens the side drawer for one Batch. |

## Side drawer

For the opened Batch: its header (ID, Lot, status), the Genealogy chain (material lot, extrusion run, metalwork lot, assembly serial, each linking to the Batch it names when one exists), Parameter actuals versus setpoint, and the Alarms raised during the run. It closes with `Esc`.

## States

- Filters match nothing: empty state with the active filters listed.
- Fewer than 2 Batches selected: Compare is disabled.
- Fifth selection attempted: limit message.

## Required test IDs

`ledger.grid`, `ledger.row-count`, `ledger.filter-<column>`, `ledger.clear-filters`, `ledger.row-select`, `ledger.compare`, `ledger.compare-panel`, `ledger.selection-limit`, `ledger.drawer`, `ledger.drawer-genealogy`, `ledger.drawer-parameters`, `ledger.drawer-alarms`, `ledger.empty`.

## Out of scope

Editing Batches, export, saved filter sets, grouping and aggregation.
