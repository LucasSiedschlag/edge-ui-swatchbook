// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import * as registration from './register';
import { trendInput } from './fixtures';
import { buildLineTrendOption } from './options';

/** The ticks the real engine lays out on the time axis. */
function ticks(from: number, to: number) {
  const host = document.createElement('div');
  document.body.append(host);
  const engine = registration.init(host, null, { renderer: 'svg', width: 600, height: 300 });
  const clock = (time: number, options?: { seconds: boolean }) => new Date(time * 1000).toISOString().slice(11, options?.seconds ? 19 : 16);
  const points = [from, to].map(tick => ({ tick, value: 1, status: 'normal' }));
  engine.setOption(buildLineTrendOption({ ...trendInput, data: [{ ...trendInput.data[0]!, points }], formatters: { ...trendInput.formatters, formatTime: clock } }));
  const axis = ((engine as unknown as { getModel(): unknown }).getModel() as { getComponent(type: string): { axis: { scale: { getTicks(): { value: number }[] } } } }).getComponent('xAxis').axis;
  const values = axis.scale.getTicks().map(tick => tick.value);
  engine.dispose();
  return values;
}

it('lays the time axis out on the data window late in a session, not from zero', () => {
  expect(ticks(3600, 3900)).toEqual([3600, 3660, 3720, 3780, 3840, 3900]);
});
