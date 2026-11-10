# 3. Batch & Lot Ledger

Route `/ledger`. A dense grid of historical Batches, for finding and comparing runs.

## Shows

About 5,000 Batches, one per row, with these columns: Batch ID, Lot, Upstream Lot, Area, Line, Product, Recipe Version, Shift, start, end, duration, status (Completed, Aborted or Rework), yield percentage and scrap count.

## Actions

| Action | Effect |
|--------|--------|
| Sort | By any column. |
| Filter by column | Text for IDs, choice lists for Area, Line, Product, Shift and status, ranges for Recipe Version number, yield, scrap and duration, and local date ranges for start and end. Filters combine. |
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

`ledger.grid`, `ledger.row-count`, `ledger.filter-batchId`, `ledger.filter-lotId`, `ledger.filter-upstreamLotId`, `ledger.filter-areas`, `ledger.filter-lines`, `ledger.filter-products`, `ledger.filter-recipeVersion`, `ledger.filter-shifts`, `ledger.filter-start`, `ledger.filter-end`, `ledger.filter-duration`, `ledger.filter-statuses`, `ledger.filter-yield`, `ledger.filter-scrap`, `ledger.clear-filters`, `ledger.row-select`, `ledger.compare`, `ledger.compare-panel`, `ledger.selection-limit`, `ledger.drawer`, `ledger.drawer-genealogy`, `ledger.drawer-parameters`, `ledger.drawer-alarms`, `ledger.empty`.

The 14 filter IDs use the exact `ledgerView` filter names; `ledgerFilterId(column)` supplies them from core.

## Out of scope

Editing Batches, export, saved filter sets, grouping and aggregation.

## Shared view defaults and presentation

Core exports `LEDGER_DEFAULT_FILTERS` (no filters), `LEDGER_DEFAULT_SORT` (start descending), `MIN_COMPARE` (2) and `MAX_COMPARE` (4). `nextLedgerSort` cycles a newly chosen column ascending, then descending, then restores the default sort. There is always an active sort. Duration filters use minutes; core also supplies duration seconds for display. Row names and active filter descriptions come from core through `ledgerFilterDescriptions`, `ledgerFilterLabels` and `ledgerGenealogyLabels`. `LEDGER_SORT_COLUMNS` lists the supported sort fields. Every Genealogy node naming an existing Batch links to that Batch, including the current one. Select-all is unavailable when visible rows plus hidden selections exceed four. Its accessible label describes the four-Batch maximum. Comparison refusal remains focusable and describes the reason. Selection changes report selected or deselected; refusals use a warning status. Date ranges include whole local dates in `America/Sao_Paulo`.

Additional bilingual labels: `ledger.duration-minutes`, `ledger.select-all`, `ledger.sort-default`.
