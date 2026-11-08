import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { darkChartTheme, lightChartTheme } from './theme';
import { ChartThemeProvider, useChartTheme } from './context';

it('provides neutral defaults with at least six series colors', () => {
  for (const theme of [lightChartTheme, darkChartTheme]) {
    expect(theme.seriesColors.length).toBeGreaterThanOrEqual(6);
    expect(theme.fontFamily).toBeTruthy();
    expect(theme.fontSize).toBeGreaterThan(0);
    expect(theme.tooltipBackgroundColor).toBeTruthy();
    expect(theme.tooltipTextColor).toBeTruthy();
    expect(theme.tooltipBorderColor).toBeTruthy();
  }
  expect(lightChartTheme.backgroundColor).not.toBe(darkChartTheme.backgroundColor);
});

it('lets a Library provide tokens once and defaults to light without a provider', () => {
  function Consumer() {
    const theme = useChartTheme();
    return createElement('span', { style: { color: theme.textColor, fontFamily: theme.fontFamily } }, theme.fontSize);
  }
  expect(renderToStaticMarkup(createElement(Consumer))).toContain(lightChartTheme.textColor);
  const theme = { ...darkChartTheme, fontFamily: 'Library font', textColor: '#abcdef' };
  const markup = renderToStaticMarkup(createElement(ChartThemeProvider, { theme }, createElement(Consumer)));
  expect(markup).toContain('Library font');
  expect(markup).toContain('#abcdef');
});
