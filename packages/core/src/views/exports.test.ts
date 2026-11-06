import { expect, it } from 'vitest';

it('exposes every view from the package entry', async () => {
  const core = (await import('../index')) as Record<string, unknown>;
  for (const name of ['alarmListView', 'criticalBannerView', 'eventLogView', 'performanceView', 'rangeWindow', 'recipeLibraryView', 'tagGridView', 'connectivityView', 'trendView', 'trendTicks']) {
    expect(typeof core[name]).toBe('function');
  }
  expect(core.TREND_WINDOWS).toBeDefined();
});
