# Shared charts

All Library apps use `@swatchbook/charts` for trends, downtime Pareto and output versus target. Wrap the app once in `ChartThemeProvider` with a complete `ChartTheme` mapped from the Library's tokens. `lightChartTheme` and `darkChartTheme` provide neutral starting points. A chart's optional `theme` prop overrides the provider.

`LineTrendChart`, `ParetoChart` and `OutputChart` take `data`, `labels`, `formatters`, `testId` and a numeric `height` in pixels. Pareto also accepts `selectedReason`. Use the labels and formatters from the core dictionaries and shared formatting helpers in the app. This package has no runtime dependency on core translations. Every label, including captions, empty states, table headings and status names, comes from the caller. Units remain unchanged.

The public local input types accept plain objects. Adapt core trend results by supplying each series' translated `name`, `unit`, `id`, optional `min`, `max` and `setpoint`, and its `points`. Coordinates can be `time` in epoch milliseconds or numeric `tick` values; both use a numeric value axis with caller formatting. `formatTime` receives the same numeric coordinate; when using ticks the caller must convert them to plant time. Stale measurements are gaps in the plotted line and remain in the table with their formatted status and last value. Null and nonfinite values show '-' in tooltips and tables. Up to four series share up to two unit axes. Unsupported selections render the caller's required `labels.unsupported` state without plotting a partial selection. Reference lines belong to their series' unit axis. Bounds include readings and references with 5 percent padding and never force zero. A point's optional `setpoint` takes precedence over the series fallback; point setpoints draw a step line and appear in the table.

Pareto takes `{ reason, minutes, sharePct, cumulativePct }` rows in the caller's order, including the exact rounded percentages from core's `performanceView`. The wrapper never recomputes percentages. `formatReason` translates reason identifiers. `formatPercent` receives values from 0 to 100; use core `formatPercentValue(locale, percent)`. Core `formatPercent(locale, fraction)` instead accepts a fraction from 0 to 1. Output takes `{ start, goodUnits, scrapUnits, targetUnits }` buckets, so core output buckets can be passed directly. `formatBucket(start)` chooses hourly or daily labels for the active range.

Each component renders a chart element with `role="img"` and the caption as its accessible label. Its container uses the supplied test ID, and its visually hidden table uses `${testId}-data`. The table remains accessible to screen readers and supplies formatted content for Playwright. Empty inputs show the caller's empty label in a sibling element with `data-empty="true"`, outside `role="img"`; optional `emptyTestId` supplies its test ID (for example `performance.empty`). The host stays mounted and hidden while empty, with no ECharts instance. React children never enter the ECharts host. Server rendering produces the table and an empty chart container without a DOM.

The pure `buildLineTrendOption`, `buildParetoOption` and `buildOutputOption` functions take the same data, labels and formatters plus a required `theme`. They disable animation. Components memoize options by their input references. Updates merge with the existing instance and replace series and axes, preserving legend selection and an open tooltip across data ticks. Keep data, labels and formatter references stable when they have not changed. `renderChartSvg(option, { width, height })` renders a standalone SVG in Node and normalizes ECharts' generated IDs for repeatable content tests. Treat each returned SVG as a separate document, such as an image source; its stable IDs are not unique across inline SVG siblings.

Run `corepack pnpm test` and `corepack pnpm typecheck` from this package. Keep all ECharts runtime registration in `src/register.ts`; do not import the full `echarts` entry point in Library apps.


Apps must lazy load `@swatchbook/charts` only on Screens 4 and 5. Its current bundle is about 567 KB before compression, so keep runtime imports out of the Shell and other Screens. One Screen 4 mount can look like this (the app supplies the container, core view, bilingual labels and Library tokens):

```tsx
import { lazy, Suspense, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { formatNumber, formatPercentValue, tr } from '@swatchbook/core';
import type { Locale } from '@swatchbook/core';
import type { ChartTheme, ParetoLabels, ParetoRow } from '@swatchbook/charts';

const ParetoChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.ParetoChart })));

function PerformancePareto({ data, labels, theme, locale }: {
  data: readonly ParetoRow[]; labels: ParetoLabels; theme: ChartTheme; locale: Locale;
}) {
  const formatters = useMemo(() => ({
    formatReason: (reason: string) => tr(locale, { key: `downtime.${reason}` }),
    formatMinutes: (minutes: number) => formatNumber(locale, minutes),
    formatPercent: (percent: number) => formatPercentValue(locale, percent),
  }), [locale]);
  return <Suspense fallback={null}>
    <ParetoChart data={data} labels={labels} formatters={formatters} theme={theme}
      testId="performance.pareto" emptyTestId="performance.empty" height={300} />
  </Suspense>;
}

createRoot(container).render(
  <PerformancePareto data={view.pareto} labels={labels} theme={libraryChartTheme} locale={locale} />,
);
```
