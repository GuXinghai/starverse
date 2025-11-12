#!/usr/bin/env node
/**
 * Builds electron/db/worker.ts into dist-electron/db/worker.cjs
 * Usage: node scripts/build-db-worker.cjs [--watch]
 */
const { build, context } = require('esbuild')
const path = require('path')
const fs = require('fs')

const isWatch = process.argv.includes('--watch')
const outdir = path.resolve(__dirname, '../dist-electron/db')

const ensureOutDir = () => {
  fs.mkdirSync(outdir, { recursive: true })
}

const buildOptions = {
  entryPoints: [path.resolve(__dirname, '../electron/db/worker.ts')],
  outfile: path.join(outdir, 'worker.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: !process.env.NODE_ENV || process.env.NODE_ENV !== 'production',
  external: ['better-sqlite3', 'better-sqlite3/*'],
  logLevel: 'info'
}

const run = async () => {
  ensureOutDir()
  if (isWatch) {
    const ctx = await context(buildOptions)
    await ctx.watch()
    console.log('[db-worker] watching for changes...')
  } else {
    await build(buildOptions)
    console.log('[db-worker] build completed')
  }
}

run().catch((err) => {
  console.error('[db-worker] build failed:', err)
  process.exit(1)
})
