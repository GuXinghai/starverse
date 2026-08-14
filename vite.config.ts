import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import { getAppCsp, injectAppCspIntoHtml, normalizeAppCspEnv } from './config/appCsp'

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
  '**/dist-native/**',
  '**/native/epoch-win32/build/**',
  '**/release/**',
  '**/out/**',
]

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [
    {
      name: 'app-csp-meta-inject',
      transformIndexHtml(html) {
        // SSOT: CSP is generated here and injected into index.html placeholder.
        const env = normalizeAppCspEnv(process.env.NODE_ENV)
        return injectAppCspIntoHtml(html, getAppCsp(env))
      },
    },
    vue(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        // Generation Compiler V2 owns the only packaged main-process entry.
        // The epoch bootstrap completes destructive workspace replacement
        // before loading the V2 IPC/runtime composition root.
        entry: 'electron/epoch2MainEntry.ts',
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src')
            }
          },
          build: {
            rollupOptions: {
              // Native CommonJS modules must keep Node's runtime resolution so
              // their ABI-specific `.node` binding is loaded from node_modules
              // (or the packaged ASAR-unpacked dependency), never from a Vite bundle.
              external: ['better-sqlite3'],
            },
          },
        },
        onstart({ startup }) {
          const netLogPath = process.env.SV_NETLOG_PATH
          const captureMode = process.env.SV_NETLOG_CAPTURE_MODE

          if (netLogPath) {
            const argv = ['.', '--no-sandbox', `--log-net-log=${netLogPath}`]
            if (captureMode) {
              argv.push(`--net-log-capture-mode=${captureMode}`)
            }
            startup(argv)
            return
          }

          startup()
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src')
            }
          }
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
  server: {
    watch: {
      ignored: [
        ...generatedRuntimeWatchIgnores,
        '**/.artifacts/netlog/**',
        '**/.artifacts/plugin-packages/**',
      ],
    },
  },
  optimizeDeps: {
    // Vite's dependency discovery pass can deadlock this renderer graph on runtime
    // non-relative specifiers (`@/...`, package imports, package CSS imports).
    // Keep resolution request-driven so Vite's normal alias/package/CSS pipelines
    // serve renderer modules deterministically in dev.
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
  build: {
    rollupOptions: {
      external: [
        /archived-services\/.*/,
        /archived-components\/.*/
      ],
      output: {
        // Keep Vite's dynamic-import preload helper in the entry chunk. Without this,
        // Rollup pulls that helper into the manual Shiki chunk and makes Shiki eager again.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Updated chunks for new dependencies
            if (id.includes('katex')) return 'katex'
            if (id.includes('shiki') || id.includes('vscode-oniguruma')) return 'shiki'
            if (id.includes('markdown-it') || id.includes('dompurify')) return 'markdown'
            if (id.includes('vue') || id.includes('pinia')) return 'vue'
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
