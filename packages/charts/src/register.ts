import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

// Keep registration in one place so every Library ships only these chart kinds.
use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, SVGRenderer]);

export { init };
