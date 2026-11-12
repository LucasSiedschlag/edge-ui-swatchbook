# 3. Batch & Lot Ledger

Route `/ledger`. A dense grid of historical Batches, for finding and comparing runs.

## Shows

About 5,000 Batches, one per row, with these columns: Batch ID, Lot, Upstream Lot, Area, Line, Product, Recipe Version, Shift, start, end, duration, status (Completed, Aborted or Rework), yield percentage and scrap count.

## Actions

| Action | Effect |
|--------|--------|
| Sort | By any column. |
| Filter by column | Text for IDs, choice lists for Area, Line, Product, Shift and status, ranges for Recipe Version number, yield, scrap and duration, and local date ranges for start and end. Filters combine. Choice lists search their displayed labels in the current language. Recipe Version bounds accept integers only. |
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

Core exports `LEDGER_DEFAULT_FILTERS` (no filters), `LEDGER_DEFAULT_SORT` (start descending), `MIN_COMPARE` (2) and `MAX_COMPARE` (4). `nextLedgerSort` cycles a newly chosen column ascending, then descending, then restores the default sort. There is always an active sort. Duration filters use minutes; core also supplies duration seconds for display. Row names and active filter descriptions come from core through `ledgerFilterDescriptions`, `ledgerFilterLabels` and `ledgerGenealogyLabels`. `LEDGER_SORT_COLUMNS` lists the supported sort fields. Every Genealogy node naming an existing Batch links to that Batch, including the current one. Select-all is unavailable when visible rows plus hidden selections exceed four. Its accessible label describes the four-Batch maximum. Opening Compare scrolls its Card into view and focuses it. Closing the comparison or changing selection to clear it returns focus to Compare. Comparison refusal remains focusable and describes the reason. Selection changes report selected or deselected; refusals use a warning status. Date ranges include whole local dates in `America/Sao_Paulo`.

Additional bilingual labels: `ledger.duration-minutes`, `ledger.select-all`, `ledger.sort-default`.

## Filter layout, accessibility and localization

Batch ID stays outside a native Collapse titled Filter, expanded by default. Its header shows the number of active filters through `ledger.filter-count`. All 14 filter controls mount immediately. Clear filters, row count and selected count remain visible above the grid when the Collapse is closed. The `/` shortcut always focuses Filter Batch ID. Filter accessible names equal their visible labels in both languages. Date ranges are named groups with distinct From and To input placeholders. Pickers use core `DATE_PATTERNS`; active date descriptions use core `formatDate`. Product descriptions include code and name.

Area and status sort by displayed labels with the locale's `Intl.Collator`; ties keep ascending Batch ID order. English is the default locale. The ascending Portuguese Area order corresponds to Extrusion, Metalworking, Assembly and status order to Completed, Aborted, Rework. Other columns keep their existing order. Each header cycles ascending, descending, then default start descending. Duration filters use minutes. Every Genealogy node naming an existing Batch links to it, including the current Batch. Select-all is unavailable when visible rows plus hidden selections exceed four. Shift-click and bulk selection enforce the same atomic four-Batch limit as individual selection.

Selection confirmations use an info status and limit refusals use a warning status. Every attempt remounts its notice to announce repeated identical messages. Historical rows and columns are memoized independently of selection statistics and clock ticks. Non-finite range input is treated as empty before reaching core; core rejects non-finite bounds with a clear error.

The pinned Actions column is about 180 px with a visually hidden header and small link buttons retaining the full Open Batch details label. Column widths leave room for at least six data columns beside the pinned columns at 1280 px. Rows use programmatic focus; Enter opens the focused row through the shared open-details shortcut, suppressed behind the drawer. The drawer has one native Close control, names the Batch in its title, and focuses that title after Genealogy navigation. It may update on clock ticks without becoming a live region. Its small Parameter actuals table wraps headers and cells without horizontal scrolling or max-content width.

Real-browser checks must confirm absolute aria-rowindex after scrolling to the end, 16 cells per row, the empty-state placeholder inside role=rowgroup, and page overflow at 1280 and 1440 px.
