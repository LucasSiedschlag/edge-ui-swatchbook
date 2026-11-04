import type { Rng } from './prng';
import type { ActiveBatch, Machine, MachineKind, RecipeVersion, Tag } from './types';

type Spec = [name: string, unit: string, setpoint: number, min: number, max: number, writable?: boolean, parameterKey?: string];
// These ranges are design suggestions, not verified production values.
const common: Spec[] = [
  ['motor-current', 'A', 15, 0, 40], ['motor-temperature', '°C', 55, 0, 100],
  ['supply-voltage', 'V', 400, 360, 440], ['power', 'kW', 8, 0, 30],
  ['vibration', 'mm/s', 2, 0, 10], ['operating-hours', 'h', 5000, 0, 20000],
  ['air-pressure', 'bar', 6, 0, 10], ['production-count', 'pcs', 500, 0, 2000],
];
const templates: Record<MachineKind, Spec[]> = {
  extruder: [
    ...[1, 2, 3, 4, 5].map((i): Spec => [`barrel-zone-${i}-temp`, '°C', 170 + i * 4, 165, 195, true, `barrel-zone-${i}`]),
    ['melt-temperature', '°C', 185, 150, 210], ['die-pressure', 'bar', 180, 120, 250, true, 'die-pressure'], ['screw-speed', 'rpm', 22, 10, 35, true, 'screw-speed'],
  ],
  calibrator: [['vacuum', 'mbar', 200, 50, 500, true], ['water-flow', 'L/min', 20, 0, 50], ['table-position', 'mm', 100, 0, 300]],
  'cooling-tank': [['water-temperature', '°C', 18, 5, 35, true], ['water-flow', 'L/min', 30, 0, 80], ['water-level', '%', 70, 0, 100]],
  puller: [['puller-speed', 'm/min', 1.7, 0.5, 3, true, 'puller-speed'], ['pull-force', 'kN', 3, 0, 10], ['belt-pressure', 'bar', 4, 0, 8]],
  saw: [['blade-speed', 'rpm', 3000, 1000, 5000, true], ['cut-length', 'mm', 2000, 500, 6000, true], ['cut-count', 'pcs', 200, 0, 1000]],
  uncoiler: [['coil-tension', 'kN', 12, 6, 20, true, 'coil-tension'], ['coil-diameter', 'mm', 800, 200, 1500], ['unwind-speed', 'm/min', 25, 0, 40]],
  'roll-former': [['line-speed', 'm/min', 25, 10, 40, true, 'line-speed'], ['forming-pressure', 'bar', 80, 50, 120, true, 'forming-pressure'], ['roller-temperature', '°C', 40, 0, 90]],
  'cut-off': [['cut-length', 'mm', 2000, 500, 6000, true], ['blade-speed', 'rpm', 2500, 1000, 5000, true], ['cut-count', 'pcs', 200, 0, 1000]],
  'stamping-press': [['press-force', 'kN', 125, 80, 180, true, 'press-force'], ['stroke-rate', 'spm', 40, 20, 60, true, 'stroke-rate'], ['die-temperature', '°C', 45, 0, 100]],
  cnc: [['spindle-speed', 'rpm', 8000, 3000, 12000, true, 'spindle-speed'], ['feed-rate', 'mm/min', 1800, 800, 3000, true, 'feed-rate'], ['tool-position', 'mm', 100, 0, 1000]],
  cutting: [['cut-length', 'mm', 2000, 500, 6000, true], ['blade-speed', 'rpm', 3000, 1000, 5000, true], ['cut-count', 'pcs', 200, 0, 1000]],
  'reinforcement-insert': [['insertion-force', 'kN', 4, 0, 10], ['insertion-depth', 'mm', 40, 10, 80, true], ['fastener-count', 'pcs', 4, 0, 20]],
  'corner-weld': [['weld-temperature', '°C', 255, 240, 270, true, 'weld-temperature'], ['weld-time', 's', 30, 20, 40, true, 'weld-time'], ['cycle-time', 's', 106, 60, 119, true, 'cycle-time']],
  cleaning: [['cutter-speed', 'rpm', 3000, 1000, 5000, true], ['cleaning-depth', 'mm', 2, 0, 5, true], ['dust-flow', 'm³/h', 200, 0, 500]],
  'hardware-fit': [['torque', 'Nm', 4, 1, 8, true], ['fastener-count', 'pcs', 8, 0, 30], ['feed-pressure', 'bar', 5, 0, 10]],
  'vision-check': [['inspection-score', '%', 95, 0, 100], ['exposure-time', 'ms', 10, 1, 50, true], ['reject-count', 'pcs', 5, 0, 100]],
};

/** Recipe-linked Tags on a running Line start at the value of that Line's active Recipe Version. */
export function generateTags(rng: Rng, machines: Machine[], active: ActiveBatch[] = [], versions: RecipeVersion[] = []): Tag[] {
  const byVersion = new Map(versions.map((v) => [v.id, v]));
  const recipeValue = new Map<string, number>();
  for (const b of active) {
    for (const p of (byVersion.get(b.recipeVersionId)?.steps ?? []).flatMap((s) => s.parameters)) recipeValue.set(`${b.lineId}|${p.key}`, p.setpoint);
  }
  const tags = generateTemplateTags(rng, machines);
  return tags.map((t) => {
    const v = t.parameterKey ? recipeValue.get(`${t.lineId}|${t.parameterKey}`) : undefined;
    return v === undefined ? t : { ...t, setpoint: v };
  });
}

function generateTemplateTags(rng: Rng, machines: Machine[]): Tag[] {
  return machines.flatMap(machine => [...common, ...templates[machine.kind]].map(([name, unit, value, min, max, writable = false, parameterKey = null]) => ({
    id: `${machine.id}.${name}`, machineId: machine.id, lineId: machine.lineId, name, unit,
    setpoint: Math.round((value + rng.float(-1, 1) * (max - min) * 0.01) * 100) / 100,
    min, max, writable, parameterKey,
  })));
}
