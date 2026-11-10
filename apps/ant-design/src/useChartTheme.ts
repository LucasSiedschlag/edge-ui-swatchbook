import type { ChartTheme } from '@swatchbook/charts';
import { theme } from 'antd';
import { useMemo } from 'react';

export function useChartTheme(): ChartTheme {
  const { token } = theme.useToken();
  return useMemo<ChartTheme>(() => ({
    fontFamily: token.fontFamily, fontSize: token.fontSize,
    textColor: token.colorText, mutedTextColor: token.colorTextSecondary, gridColor: token.colorBorderSecondary,
    backgroundColor: token.colorBgContainer,
    seriesColors: [token.colorPrimary, token.colorSuccess, token.colorWarning, token.colorTextSecondary, token.colorInfo, token.colorTextTertiary],
    goodColor: token.colorSuccess, scrapColor: token.colorError, targetColor: token.colorText,
    limitColor: token.colorError, warningColor: token.colorWarning,
    tooltipBackgroundColor: token.colorBgElevated, tooltipTextColor: token.colorText, tooltipBorderColor: token.colorBorder,
  }), [token]);
}
