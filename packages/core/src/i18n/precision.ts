/** Design suggestion for display precision, not verified production requirements. Unknown units use one decimal. */
export const DECIMALS_BY_UNIT = {
  rpm: 0, spm: 0, mm: 0, 'mm/min': 0, ms: 0, s: 0, min: 0, pcs: 0, h: 0, V: 0, mbar: 0, 'm³/h': 0,
  '°C': 1, bar: 1, kN: 1, kW: 1, A: 1, 'L/min': 1, Nm: 1, 'm/min': 1, 'mm/s': 1, '%': 1,
} as const;
