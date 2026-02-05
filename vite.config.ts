import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [
    vue(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
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
        '**/.artifacts/netlog/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      external: [
        /archived-services\/.*/,
        /archived-components\/.*/
      ],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('highlight.js')) return 'highlight'
            if (id.includes('katex')) return 'katex'
            if (id.includes('marked') || id.includes('dompurify')) return 'markdown'
            if (id.includes('vue') || id.includes('pinia')) return 'vue'
            return 'vendor'
          }
        },
      },
    },
  },
})
