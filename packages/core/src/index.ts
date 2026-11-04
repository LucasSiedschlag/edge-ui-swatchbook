export const LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

export const SCREENS = [
  { id: 'deck', route: '/deck' },
  { id: 'recipes', route: '/recipes' },
  { id: 'ledger', route: '/ledger' },
  { id: 'performance', route: '/performance' },
  { id: 'parameters', route: '/parameters' },
  { id: 'control', route: '/control' },
] as const;
export type ScreenId = (typeof SCREENS)[number]['id'];
