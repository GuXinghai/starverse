#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron')
const child = spawn(electronExecutable, [path.resolve('scripts/smoke/magika-utility-process-v020.cjs')], {
  stdio: 'inherit', shell: false, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' },
})
const timer = setTimeout(() => {
  child.kill()
  console.error('Electron utility-process smoke exceeded its 90 second outer deadline.')
  process.exitCode = 1
}, 90_000)
child.once('error', (error) => { clearTimeout(timer); console.error(error.message); process.exitCode = 1 })
child.once('close', (code) => { clearTimeout(timer); process.exitCode = code ?? 1 })
