import { defineConfig } from 'vite'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { getAppCsp, injectAppCspIntoHtml, normalizeAppCspEnv } from '../../config/appCsp'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
  plugins: [
    {
      name: 'app-csp-meta-inject-smoke',
      transformIndexHtml(html) {
        const env = normalizeAppCspEnv(process.env.NODE_ENV)
        return injectAppCspIntoHtml(html, getAppCsp(env))
      },
    },
    vue(),
  ],
  server: {
    watch: {
      ignored: ['**/.artifacts/netlog/**'],
    },
  },
})
