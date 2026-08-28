import { defineConfig } from 'tsdown'

/** Bundle the Electron main process while retaining its runtime-provided modules. */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: { neverBundle: ['electron', 'electron-updater'] },
  fixedExtension: false,
  dts: false,
  clean: false,
})
