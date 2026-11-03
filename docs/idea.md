# Idea

## Summary

edge-ui-swatchbook is a showroom for UI libraries. The same six industrial software screens are built once per library, with the same data and the same layout. You open a screen, switch the library, and see how each one handles the same job.

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
- Keep everything identical except the library: same data, same routes, same layout shell.
- Be easy to open and click through (static site, no backend).

## Non-goals

- A real industrial product or backend.
- Pixel-identical screens across libraries. Each library should look and behave the way it naturally does.
- Ranking libraries. The repo shows, it does not judge.

## Proposed libraries

Initial guess, open to change:

- shadcn/ui
- MUI
- Ant Design
- Mantine

## Proposed stack

Defaults, open to change:

- React and TypeScript with Vite
- Mock data only
- Static deploy on GitHub Pages

## Open questions

- Final list of libraries.
- Whether each library lives in its own app/folder or all are routed inside one app.
- How the shared mock data and layout shell are structured so libraries stay swappable.
- Scope of the guided tour.
