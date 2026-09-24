/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the build from https://gcrate.github.io/last-orders/.
  // The dev server stays at the root.
  base: command === 'build' ? '/last-orders/' : '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
}));
