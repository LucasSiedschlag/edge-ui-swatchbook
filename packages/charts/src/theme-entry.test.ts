import { expect, it, vi } from 'vitest';

// Importing a Shell theme must never evaluate ECharts or its registration.
vi.mock('echarts/core', () => { throw new Error('Theme entry loaded ECharts'); });
vi.mock('./register', () => { throw new Error('Theme entry registered charts'); });

it('exports the lightweight theme entry without loading ECharts', async () => {
  const theme = await import('@swatchbook/charts/theme');
  expect(theme.ChartThemeProvider).toBeTypeOf('function');
  expect(theme.useChartTheme).toBeTypeOf('function');
  expect(theme.lightChartTheme.backgroundColor).toBe('#ffffff');
  expect(theme.darkChartTheme.backgroundColor).toBe('#202020');
});
