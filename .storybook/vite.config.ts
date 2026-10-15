import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { generatedRuntimeWatchIgnores } from '../config/generatedRuntimeWatchIgnores'

// Storybook owns browser HTML and must not load application CSP/Electron hooks.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  server: { watch: { ignored: [...generatedRuntimeWatchIgnores] } },
})
