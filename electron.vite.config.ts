import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('electron/main.ts'),
          worker: resolve('electron/db/worker.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'worker') return 'db/worker.cjs'
            return '[name].js'
          }
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          preload: resolve('electron/preload.ts'),
          inappPreload: resolve('electron/preload/inapp-preload.ts')
        },
        output: {
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: 'index.html',
        external: [
          /archived-services\/.*/,
          /archived-components\/.*/
        ]
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [vue()],
    css: {
      postcss: './postcss.config.js'
    }
  }
})
