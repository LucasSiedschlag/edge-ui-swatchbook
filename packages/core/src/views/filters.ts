/** Public filters also accept cleared control values. */
export type FilterInput<T> = { [K in keyof T]: T[K] | null | '' | readonly never[] };

export function normalizeFilters<T extends object>(input: FilterInput<T> | null | undefined): T {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input ?? {})) {
    if (raw === undefined || raw === null) continue;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const bounds = normalizeFilters(value);
      if (Object.keys(bounds).length) result[key] = bounds;
    } else result[key] = Array.isArray(value) ? [...value] : value;
  }
  return result as T;
}
