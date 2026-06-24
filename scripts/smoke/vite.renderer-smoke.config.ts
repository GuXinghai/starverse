import { defineConfig } from 'vite'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { getAppCsp, injectAppCspIntoHtml, normalizeAppCspEnv } from '../../config/appCsp'

const generatedRuntimeWatchIgnores = [
  '**/.external-runtime-work/**',
  '**/.starverse-engines/**',
  '**/managed-runtimes/**',
  '**/staging/**',
  '**/sandbox/**',
  '**/temp/**',
  '**/tmp/**',
  '**/.vite/**',
  '**/dist/**',
  '**/dist-electron/**',
  '**/release/**',
  '**/out/**',
]

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    holdUntilCrawlEnd: false,
    include: [
      '@floating-ui/vue',
      'dompurify',
      'katex',
      'markdown-it',
      'shiki',
      'vue',
      'zod',
    ],
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
      ignored: [
        ...generatedRuntimeWatchIgnores,
        '**/.artifacts/netlog/**',
      ],
    },
  },
})
