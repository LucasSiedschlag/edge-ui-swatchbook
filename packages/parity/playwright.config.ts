import { defineConfig } from '@playwright/test';
import type { Options } from './tests/harness';

const LIBRARY_URL = process.env.LIBRARY_URL;
const baseURL = LIBRARY_URL ?? 'http://localhost:5199';

export default defineConfig<Options>({
  testDir: './tests',
  // A loaded machine makes dev-server pages slow; give each check room instead of retrying blindly.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  // Without LIBRARY_URL the suite starts the Ant Design dev server itself.
  ...(LIBRARY_URL ? {} : {
    webServer: {
      command: 'corepack pnpm --filter @swatchbook/ant-design exec vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
    },
  }),
  // The projects differ only by the language preference.
  projects: [
    { name: 'en', use: { language: 'en' } },
    { name: 'pt-BR', use: { language: 'pt-BR' } },
  ],
});
