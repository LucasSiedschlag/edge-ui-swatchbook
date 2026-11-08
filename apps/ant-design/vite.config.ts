import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/edge-ui-swatchbook/ant-design/' : '/',
  plugins: [react()],
  // One copy of React for the app, the runtime and the charts (ADR 0004).
  resolve: { dedupe: ['react', 'react-dom'] },
  test: { setupFiles: ['./src/test-setup.ts'] },
}));
