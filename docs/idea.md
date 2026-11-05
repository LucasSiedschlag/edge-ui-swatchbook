# Idea

## Summary

edge-ui-swatchbook is a showroom for UI libraries. The same six industrial software screens are built once per library, with the same data and the same information. You open a screen, switch the library, and see how each one handles the same job.

## Metaphor

A salesperson in a shop spreads out samples so you can compare them side by side. Here the samples are UI libraries.

| Shop | This repo |
|------|-----------|
| The salesperson, guiding you step by step | A guided tour through the screens |
| Wood samples and colors | Library picker (swatches) |
| Finishes (matte, gloss) | Theme and density toggle (light/dark, compact/comfortable) |
| Styles (modern, industrial) | Presets that bundle a theme and density |
| The furniture preview | The live screen, updated as you switch |

## The six screens

1. **Operations Live Deck (Cockpit).** For operators on shift. Active batch/lot status, a clear Running/Stopped/Alarm indicator, live KPIs, a minimized critical alarm banner, and quick actions (emergency stop, pause, shift handover).
2. **Interactive Recipe Lab (Architect).** For engineers. Versioned recipe library (Draft/Approved), step sequence builder, parameter limit fields, and a dependency check that flags unsafe or impossible values before saving.
3. **Batch & Lot Ledger (Excel Engine).** Dense, spreadsheet-like grid of historical batches. Column filters, multi-select for comparison, and a side drawer with row details.
4. **Plant Performance Center (Dashboard).** For managers. OEE, downtime Pareto, output versus target, and shift performance history.
5. **Live Parameter Matrix (Telemetry View).** For technicians. Dense grid of raw tags, multi-variable real-time trends (for example temperature versus pressure), manual setpoint overrides, and device connectivity status.
6. **Control Room Command (Audit & Alarm Hub).** Active alarm list with acknowledgement, chronological event log (who changed what and when), and hardware communication diagnostics.

## Goals

- Make library differences visible on realistic, demanding screens, not toy demos.
- Keep content identical except the library: same data, same routes, same information and actions, same shell structure.
- Be easy to open and click through (static site, no backend).

## Non-goals

- A real industrial product or backend.
- Pixel-identical screens across libraries. Each library should look and behave the way it naturally does. See [ADR 0002](adr/0002-parity-means-identical-content-native-rendering.md).
- Ranking libraries. The repo shows, it does not judge.
- Phone or touch layouts. The target is desktop, keyboard and mouse first.

## Decisions

- **Parity.** Identical: screens, routes, mock data, information, actions, shell structure, keyboard shortcut bindings. Native: components, spacing, typography, grid and focus behavior, theming. A missing capability is a Gap and is shown as it is.
- **Plant.** A fictional PVC window and door frame maker in the Joinville/SC region: 3 areas, 7 lines, 27 machines (extrusion, metalworking, assembly). Lots link through a genealogy from material lot to assembly serial. Alarms follow ISA-18.2 priorities and states. Users and roles are labels only, with no login or permission checks. The layout, vocabulary and per-screen specs are in [docs/screens](screens/README.md). Parameter ranges are design suggestions, not verified production values.
- **Shared core.** One Mock Dataset (about 5,000 batches, 300 tags, 90 days of shift history, a few hundred events, generated with a fixed seed), one deterministic Simulator driven by a tick, and shared Plant State logic. Plant State resets on reload.
- **Mock Dataset shape.** Finished Batches are in `batches` (the Ledger rows). Six of the seven Lines also have a running Batch in `activeBatches`, with target, produced and scrap counts. The Line C1 is idle, for more than a Shift, so the empty states exist. `findBatch` looks up a Batch in both lists. Shift and hourly (last 7 days) output are built from the Batches, so the Ledger and Performance agree. Downtime reasons are the eight on Screen 4, each kept to the Line types where it applies. Every Recipe Version has a creation and approval time, a Batch only runs a version approved before it started, and the Event Log is built from those times. Event Log entries carry a target kind, a Shift target is `YYYY-MM-DD/S1`, and overrides and handovers carry a `note`. Seeded Pauses and Emergency stops sit between Batches. A running Batch makes 95 percent of the ideal rate, so it reaches its target a few minutes after its planned end, and then stays at 100 percent with no new Batch and no output for the rest of the session. Time with nothing to run counts as changeover in the lost time of the current Shift. The Simulator answers with a pure function of the dataset and the tick. Tags have an alarm state with a 5 percent deadband on each side, kept per Tag, so a value hovering at a limit raises once and a switch from one side to the other raises again. The steps of a Setpoint Override only grow at the end (Reset to recipe value is a new step, never a removal). Alarms are derived, not accumulated: one chronological list of Simulator level transitions, run spans and acknowledgements supplies the Alarm list and Line status. A second override of the same Tag in the same tick replaces the last step, and an override that differs from the recipe value also ends the hold of an Alarm open at load. The live OEE rises to about 0.9 within half an hour, because only Pauses create live downtime, against about 0.65 in the history; this is accepted for now and revisited with Screen 4. Plant State (Issue #3) layers Setpoint Overrides and Pauses on top through an `Overlay`, and Screen 5 trends read `tagSeries`, which also covers the 2 hours before load.
- **Last shift.** It means the most recent completed Shift. The clock starts at a Shift start (06:00), so the current Shift begins empty.
- **Charts.** One shared chart library, themed per library, behind a thin wrapper so it can change later. It is chosen when the first library is built.
- **Structure.** A pnpm monorepo: a shared `core` package and one Vite app per library, deployed under sub-paths of one GitHub Pages site. The shell switcher links to the same screen in another app. See [ADR 0001](adr/0001-one-app-per-library-with-shared-core.md).
- **Stack.** React, strict TypeScript, Vite, pnpm workspaces, static deploy on GitHub Pages.
- **Specs and checks.** A short spec per screen in `docs/screens/`. One Playwright suite runs against every library app and checks content and actions through shared test IDs, in both languages. No pixel comparison.
- **Build order.** One library first with all six screens, then the others one at a time. Ant Design goes first because it proves the core, the specs and the Playwright suite.
- **Release scope.** v1 has 3 libraries, v2 adds 3 more (6 in total), and the rest stay in a backlog. Adding a library later is cheap because each one is a separate app over the shared core. See [Libraries](#libraries).
- **Theme and density.** The shell has light/dark and compact/comfortable toggles plus presets. Each library maps them to its own theming. Where density is not supported, the toggle shows it as unavailable.
- **Guided tour.** v1 is linear and neutral: one step per screen, a short note on what to look for, defined as shared data.
- **Languages.** English (`en`) and Brazilian Portuguese (`pt-BR`). The default follows the browser language, with English as the fallback. Typed dictionaries live in the core. Mock data text is stored as translation keys plus parameters, and identifiers (batch IDs, tag names) stay untranslated. Numbers and dates use `Intl`, units are never translated, and the plant time zone is `America/Sao_Paulo`.
- **Preferences.** Language, theme and density persist in `localStorage`, shared across the apps on the same origin.
- **Docs language.** `README.md`, `GLOSSARY.md` and `docs/` stay in English. Only the product UI is bilingual.

## Library criteria

A library is a candidate only if it:

- supports React,
- is actively maintained,
- has native dark mode,
- offers a data grid, built in or officially paired, usable for free,
- is free to use for a public demo,
- can render everything it shows itself (components, grid, date picker, empty states) in both `en` and `pt-BR`.

Where a library ships an official `pt-BR` pack, use it. Where it does not, we translate its strings ourselves in the core dictionaries, and record that as the library's Translation Burden. That cost is part of what the showroom shows.

Paid-only features are excluded, not worked around.

## Libraries

| Release | Library | `pt-BR` |
|---------|---------|---------|
| v1 (Ant Design first) | Ant Design | official pack |
| v1 | UI5 Web Components for React | official pack |
| v1 | Siemens iX | Translation Burden |
| v2 | Cloudscape | official pack |
| v2 | Carbon | Translation Burden |
| v2 | Blueprint | Translation Burden |
| Backlog | Fluent UI v9, Semi Design, Arco Design, TDesign, PatternFly, Vaadin React | mixed |
| Backlog | Mantine, shadcn/ui, Chakra UI | MUI: official pack, grid pack partial. shadcn/ui: none. Mantine and Chakra: Translation Burden |

- **Mantine, shadcn/ui and Chakra:** the table is assembled from a free grid (mantine-datatable or TanStack Table), with no continuous virtualization out of the box.

## Open questions

- The chart library, chosen when the first library is built.
