import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { lightChartTheme } from './theme';
import type { ChartTheme } from './theme';

const ChartThemeContext = createContext(lightChartTheme);

/** Wrap a Library once with its native theme tokens. */
export function ChartThemeProvider({ theme, children }: { theme: ChartTheme; children?: ReactNode }) {
  return <ChartThemeContext.Provider value={theme}>{children}</ChartThemeContext.Provider>;
}

export function useChartTheme(): ChartTheme {
  return useContext(ChartThemeContext);
}
