import { defineConfig } from 'vite'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { appCspPlugin } from '../../config/appCspPlugin'

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
    appCspPlugin('app-csp-meta-inject-smoke'),
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
