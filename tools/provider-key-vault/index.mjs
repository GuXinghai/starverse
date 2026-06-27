#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCli } from './src/cli.mjs'

export { runCli } from './src/cli.mjs'

const thisFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''

if (invokedFile === thisFile) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Provider key vault failed.'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
