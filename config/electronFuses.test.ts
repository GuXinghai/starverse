import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// R6-01 (P8-02): without `electronFuses`, electron-builder leaves every fuse at its default. The packaged
// binary is checked with `npx @electron/fuses read --app <exe>`; this guards the configuration itself.
describe('packaged Electron fuses', () => {
  const build = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).build

  it('turns off Node-as-runtime entry points and loads only the integrity-checked ASAR', () => {
    expect(build.asar).toBe(true)
    expect(build.electronFuses).toMatchObject({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    })
  })

  it('does not rely on ELECTRON_RUN_AS_NODE in application code', () => {
    // The app starts helper processes with utilityProcess.fork, which does not need the fuse.
    const runner = readFileSync(path.join(ROOT_DIR, 'electron', 'services', 'magikaUtilityProcessRunner.ts'), 'utf8')
    expect(runner).toContain('utilityProcess.fork')
    expect(runner).not.toContain('ELECTRON_RUN_AS_NODE')
  })
})
