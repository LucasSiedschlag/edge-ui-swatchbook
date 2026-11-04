import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/edge-ui-swatchbook/ant-design/' : '/',
  plugins: [react()],
}));
