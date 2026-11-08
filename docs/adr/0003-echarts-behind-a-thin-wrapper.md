# ECharts behind a thin wrapper

Apache ECharts with the SVG renderer supplies every chart kind the Screens need and has built in theming. It lives behind `packages/charts` (`@swatchbook/charts`) so the chart library stays swappable, and each Library supplies its own colors and fonts through the shared theme provider. SVG output can be read in the DOM and rendered in Node tests, while a visually hidden data table alongside every chart gives screen readers and Playwright the same formatted content across Libraries. Playwright checks test IDs and content, never pixels. The cost is bundle size per app, mitigated by modular imports, registering only the required chart kinds and components, and one shared wrapper.

## Considered Options

- **Recharts:** fits React naturally, but ECharts covers the required combinations and reference lines in one option model.
- **Chart.js:** supports the required chart kinds, but its canvas renderer does not provide the chosen SVG output.
- **uPlot:** suits dense time series, but Pareto and stacked output would need more custom chart logic.
