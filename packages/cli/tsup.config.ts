import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  external: ['level', 'neo-blessed'],
  noExternal: ['@mynth/core', '@mynth/sdk'],
});
