import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChartThemeProvider } from './context';
import { LineTrendChart, OutputChart, ParetoChart } from './components';
import { outputInput, paretoInput, trendInput } from './fixtures';
import { darkChartTheme } from './theme';

function tableRows(markup: string): string[][] {
  const body = markup.match(/<tbody>(.*?)<\/tbody>/s)?.[1] ?? '';
  return [...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map((row) => [...row[1]!.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((cell) => cell[1]!));
}

it('server renders the trend table with every formatted point, status and reference value', () => {
  const markup = renderToStaticMarkup(<LineTrendChart {...trendInput} testId="parameters.trend" height={280} />);
  expect(markup).toContain('data-testid="parameters.trend"');
  expect(markup).toContain('data-testid="parameters.trend-data"');
  expect(markup).toContain('role="img" aria-label="Trend"');
  expect(markup).toContain('<caption>Trend</caption>');
  expect(markup).toContain('<th scope="col">Time</th>');
  expect(markup).toContain('clip-path:inset(50%)');
  expect(markup).not.toContain('display:none');
  expect(markup).not.toContain('<svg');
  expect(tableRows(markup)).toEqual([
    ['Temperature', 'time:1000', '18 °C', 'status:normal', '10 °C', '30 °C', '20 °C'],
    ['Temperature', 'time:2000', '19 °C', 'status:stale', '10 °C', '30 °C', '20 °C'],
  ]);
});

it('server renders Pareto shares and cumulative percentages and all output buckets', () => {
  const pareto = renderToStaticMarkup(<ParetoChart {...paretoInput} testId="performance.pareto" height={300} />);
  expect(pareto).toContain('role="img" aria-label="Downtime"');
  expect(pareto).toContain('data-testid="performance.pareto-data"');
  expect(tableRows(pareto)).toEqual([
    ['reason:change', '60 min', '60%', '60%'], ['reason:jam', '30 min', '30%', '90%'], ['reason:other', '10 min', '10%', '100%'],
  ]);
  const output = renderToStaticMarkup(<OutputChart {...outputInput} testId="performance.output" height={300} />);
  expect(output).toContain('role="img" aria-label="Output"');
  expect(output).toContain('data-testid="performance.output-data"');
  expect(tableRows(output)).toEqual([['bucket:1000', '12 units', '3 units', '20 units'], ['bucket:2000', '8 units', '2 units', '11 units']]);
});

it('applies context tokens and a per-chart override on the server', () => {
  const { theme: _theme, ...props } = outputInput;
  const markup = renderToStaticMarkup(<ChartThemeProvider theme={darkChartTheme}><OutputChart {...props} testId="output" height={300} /></ChartThemeProvider>);
  expect(markup).toContain(`background-color:${darkChartTheme.backgroundColor}`);
  expect(markup).toContain(`color:${darkChartTheme.textColor}`);
  const override = { ...darkChartTheme, fontFamily: 'Library Font', backgroundColor: '#123456' };
  const own = renderToStaticMarkup(<ChartThemeProvider theme={darkChartTheme}><OutputChart {...props} theme={override} testId="output" height={300} /></ChartThemeProvider>);
  expect(own).toContain('font-family:Library Font');
  expect(own).toContain('background-color:#123456');
});

it('renders explicit caller-labelled empty states and empty accessible tables', () => {
  const components = [
    createElement(LineTrendChart, { ...trendInput, data: [], testId: 'trend', height: 200 }),
    createElement(LineTrendChart, { ...trendInput, data: [{ ...trendInput.data[0]!, points: [] }], testId: 'trend', height: 200 }),
    createElement(ParetoChart, { ...paretoInput, data: [], testId: 'pareto', height: 200 }),
    createElement(OutputChart, { ...outputInput, data: [], testId: 'output', height: 200 }),
  ];
  for (const component of components) {
    const markup = renderToStaticMarkup(component);
    expect(markup).toContain('data-empty="true"');
    expect(markup).toContain(component.props.labels.empty);
    expect(markup).toContain('<table');
    expect(tableRows(markup)).toEqual([]);
  }
});


it('renders an explicit unsupported trend state without throwing', () => {
  const data = ['°C', 'bar', 'rpm', 'm/min', 'ms'].map((unit, index) => ({ ...trendInput.data[0]!, id: String(index), unit }));
  const markup = renderToStaticMarkup(<LineTrendChart {...trendInput} data={data} labels={{ ...trendInput.labels, unsupported: 'Select at most four Tags' }} testId="trend" height={200} />);
  expect(markup).toContain('Select at most four Tags');
  expect(markup).toContain('data-empty="true"');
});

it('keeps point setpoints and missing values in the accessible table', () => {
  const data = [{ ...trendInput.data[0]!, points: [null, NaN, Infinity].map((value, tick) => ({ tick, value, status: 'stale', setpoint: 20 + tick })) }];
  const markup = renderToStaticMarkup(<LineTrendChart {...trendInput} data={data} testId="trend" height={200} />);
  expect(tableRows(markup).map(row => [row[2], row[6]])).toEqual([['-', '20 °C'], ['-', '21 °C'], ['-', '22 °C']]);
});
