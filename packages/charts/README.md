# Shared charts

All Library apps use `@swatchbook/charts` for trends, downtime Pareto and output versus target. Wrap the app once in `ChartThemeProvider` with a complete `ChartTheme` mapped from the Library's tokens. `lightChartTheme` and `darkChartTheme` provide neutral starting points. A chart's optional `theme` prop overrides the provider.

`LineTrendChart`, `ParetoChart` and `OutputChart` take `data`, `labels`, `formatters`, `testId` and a numeric `height` in pixels. Pareto also accepts `selectedReason`. Use the labels and formatters from the core dictionaries and shared formatting helpers in the app. This package has no runtime dependency on core translations. Every label, including captions, empty states, table headings and status names, comes from the caller. Units remain unchanged.

The public local input types accept plain objects. Adapt core trend results by supplying each series' translated `name`, `unit`, `id`, optional `min`, `max` and `setpoint`, and its `points`. Coordinates can be `time` in epoch milliseconds or numeric `tick` values. `formatTime` receives the same numeric coordinate; when using ticks the caller must convert them to plant time. Stale measurements are gaps in the plotted line and remain in the table with their formatted status and last value. Up to four series share up to two unit axes. Reference lines belong to their series' unit axis.

Pareto takes `{ reason, minutes }` rows in the caller's order and computes shares and cumulative percentages. `formatReason` translates reason identifiers. `formatPercent` receives values from 0 to 100. Output takes `{ start, goodUnits, scrapUnits, targetUnits }` buckets, so core output buckets can be passed directly. `formatBucket(start)` chooses hourly or daily labels for the active range.

Each component renders a chart element with `role="img"` and the caption as its accessible label. Its container uses the supplied test ID, and its visually hidden table uses `${testId}-data`. The table remains accessible to screen readers and supplies formatted content for Playwright. Empty inputs show the caller's empty label in an element with `data-empty="true"`; no ECharts instance is created for an empty chart. Server rendering produces the table and an empty chart container without a DOM.

The pure `buildLineTrendOption`, `buildParetoOption` and `buildOutputOption` functions take the same data, labels and formatters plus a required `theme`. They disable animation. `renderChartSvg(option, { width, height })` renders a standalone SVG in Node and normalizes ECharts' generated IDs for repeatable content tests. Treat each returned SVG as a separate document, such as an image source; its stable IDs are not unique across inline SVG siblings.

Run `corepack pnpm test` and `corepack pnpm typecheck` from this package. Keep all ECharts runtime registration in `src/register.ts`; do not import the full `echarts` entry point in Library apps.
