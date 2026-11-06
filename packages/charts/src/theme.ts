export interface ChartTheme {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  mutedTextColor: string;
  gridColor: string;
  backgroundColor: string;
  seriesColors: readonly [string, string, string, string, string, string, ...string[]];
  goodColor: string;
  scrapColor: string;
  targetColor: string;
  limitColor: string;
  warningColor: string;
  tooltipBackgroundColor: string;
  tooltipTextColor: string;
  tooltipBorderColor: string;
}

export const lightChartTheme: ChartTheme = {
  fontFamily: 'sans-serif', fontSize: 12,
  textColor: '#242424', mutedTextColor: '#616161', gridColor: '#dedede', backgroundColor: '#ffffff',
  seriesColors: ['#426b8c', '#84704c', '#657d64', '#856980', '#647e83', '#8b655b'],
  goodColor: '#527352', scrapColor: '#976050', targetColor: '#414141', limitColor: '#8c6666', warningColor: '#957127',
  tooltipBackgroundColor: '#ffffff', tooltipTextColor: '#242424', tooltipBorderColor: '#dedede',
};

export const darkChartTheme: ChartTheme = {
  fontFamily: 'sans-serif', fontSize: 12,
  textColor: '#ededed', mutedTextColor: '#b0b0b0', gridColor: '#484848', backgroundColor: '#202020',
  seriesColors: ['#8cb7d8', '#cfb783', '#9ebc9b', '#c4a1bf', '#99bdc3', '#d1a194'],
  goodColor: '#9bbd95', scrapColor: '#d5a08f', targetColor: '#ededed', limitColor: '#d29d9d', warningColor: '#d8bb77',
  tooltipBackgroundColor: '#303030', tooltipTextColor: '#ededed', tooltipBorderColor: '#686868',
};

