# Screen specs

Each spec says what a Screen must show, which actions it offers, and which states it has. Specs say nothing about layout, because each Library renders them its own way (see [ADR 0002](../adr/0002-parity-means-identical-content-native-rendering.md)). Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

| # | Screen | Route | Spec |
|---|--------|-------|------|
| 1 | Operations Live Deck | `/deck` | [01-operations-live-deck.md](01-operations-live-deck.md) |
| 2 | Interactive Recipe Lab | `/recipes` | [02-interactive-recipe-lab.md](02-interactive-recipe-lab.md) |
| 3 | Batch & Lot Ledger | `/ledger` | [03-batch-and-lot-ledger.md](03-batch-and-lot-ledger.md) |
| 4 | Plant Performance Center | `/performance` | [04-plant-performance-center.md](04-plant-performance-center.md) |
| 5 | Live Parameter Matrix | `/parameters` | [05-live-parameter-matrix.md](05-live-parameter-matrix.md) |
| 6 | Control Room Command | `/control` | [06-control-room-command.md](06-control-room-command.md) |

## Shell

Every Library has the same Shell around the Screens: a header with the Library picker, language switch, theme toggle, density toggle, preset picker and Tour start, plus navigation with the six Screens. Planned Libraries are shown disabled. While the Tour is active, a neutral banner shows the Screen name, the note and `Step x of y` with Previous, Next and Finish. The route is the single source of the Tour step.

Required test IDs: `shell.nav-deck`, `shell.nav-recipes`, `shell.nav-ledger`, `shell.nav-performance`, `shell.nav-parameters`, `shell.nav-control`, `shell.library-picker`, `shell.language`, `shell.theme`, `shell.density`, `shell.preset`, `shell.tour-start`, `shell.tour`, `shell.tour-previous`, `shell.tour-next`, `shell.tour-finish`.

A Screen that is not built yet in a Library shows a translated placeholder block with `data-testid="<route>.placeholder"` (for example `deck.placeholder`). It is not a required ID.

## The plant

A fictional PVC window and door frame maker in the Joinville/SC region. 3 Areas, 7 Lines, 27 Machines.

| Area | Line | Machines |
|------|------|----------|
| Extrusion | E1, E2 | Extruder, Calibrator, Cooling tank, Puller, Saw (5 each) |
| Metalworking | RF1 | Uncoiler, Roll former, Cut-off (3) |
| Metalworking | P1 | Stamping press (1) |
| Metalworking | C1 | CNC (1) |
| Assembly | A1, A2 | Cutting, Reinforcement insert, Corner weld, Cleaning, Hardware fit, Vision check (6 each) |

The takt time of the Assembly Lines is 120 s. Weld window is 240 to 270 °C for 20 to 40 s. Rigid PVC barrel zones run between 165 and 195 °C.

## Shared conventions

- **Status vocabulary.** A Line is Running, Stopped or Alarm. A Machine link is Online, Degraded or Offline. A Tag is Normal, High, Low or Stale.
- **Time.** All times show in `America/Sao_Paulo`. Every Screen reads "now" from the Simulator clock.
- **Ranges.** Time range choices are always Last shift, Last 24 hours, Last 7 days and Last 30 days, except live trends (see Screen 5).
- **Text.** Every string comes from the core dictionaries in `en` and `pt-BR`.
- **Test IDs.** Every required element carries `data-testid="<route>.<name>"`, for example `deck.line-status`. Core's `TEST_IDS` registry lists the required IDs, checked against these specs. `ledgerFilterId(column)` uses the exact `ledgerView` filter names. `<screen>.empty` identifies one whole Screen empty state; `<screen>.<block>-empty` identifies a block that can be empty alone. `performance.empty` appears once when `hasProduction` is false, because all blocks are empty together. Libraries may add other IDs.
- **Shortcuts.** Bindings are defined once in the core and are inactive while a text field has focus or an open dialog contains focus. Libraries own Escape for their native Drawer, Modal and dialog.

| Key | Action |
|-----|--------|
| `/` | Focus the filter or search field |
| `Enter` | Open details of the focused row |
| `Esc` | Close the open drawer or dialog |
| `a` | Acknowledge the selected Alarm(s) |
| `1` to `6` | Go to Screen 1 to 6 |

Emergency stop has no shortcut.

- **Event Log.** Edits to a Draft's working copy (Steps and Parameters) are recorded when the Draft is saved, approved or discarded, not one by one. All other state-changing actions write one entry each with the fictional current User, the time, the action and the target. No-op actions write no entry.
- **Out of scope for every Screen.** Login, permissions, persistence, real devices, printing and export.

Date pickers use core `DATA_START` and `DATA_END`, the inclusive first and last instants of history, each with `timestamp` and plant-local `date` fields. This lets each Library open its picker on the Mock Dataset's month.
