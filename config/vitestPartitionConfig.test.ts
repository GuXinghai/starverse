import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'
import overrides from '../tests/test-partition-overrides.json'
import unit from '../vitest.unit.config'
import ui from '../vitest.ui.config'
import integration from '../vitest.integration.config'
import { ownerForTestPath, SLOW_TEST_GLOBS } from '../vitest.shared'

const configs = { unit, ui, integration } as const

describe('Vitest partition configuration', () => {
  it('keeps each override in exactly its owner include and outside other owners', () => {
    for (const [file, owner] of Object.entries(overrides)) {
      for (const [name, config] of Object.entries(configs)) {
        const include = config.test?.include ?? []
        const exclude = config.test?.exclude ?? []
        if (name === owner) {
          expect(include).toContain(file)
        } else {
          expect(exclude).toContain(file)
        }
      }
    }
  })

  it('uses the declared environment and setup for each regular owner', () => {
    expect(unit.test?.environment).toBe('node')
    expect(unit.test?.setupFiles).toContain('./tests/setup-node.ts')
    expect(ui.test?.environment).toBe('jsdom')
    expect(ui.test?.setupFiles).toContain('./tests/setup-ui.ts')
    expect(integration.test?.environment).toBe('node')
    expect(integration.test?.pool).toBe('forks')
    expect(integration.test?.maxWorkers).toBe(2)
  })

  it('keeps every slow suffix out of routine configs', () => {
    for (const config of Object.values(configs)) {
      for (const pattern of SLOW_TEST_GLOBS) expect(config.test?.exclude).toContain(pattern)
    }
  })

  // P8-04 / P8-05: Vitest applies `exclude` after `include`, so an override can
  // be listed in its owner's include and still be collected by no config.
  // Resolve the real globs and require exactly one collecting config per file.
  it('collects every non-slow test file in exactly its owner config', () => {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const discovered = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(file => /\.(?:test|spec)(?:\.[^.]+)+$/iu.test(path.posix.basename(file)) &&
        /\.[cm]?[jt]sx?$/u.test(file) && fs.existsSync(path.join(repositoryRoot, file)))
      .filter(file => !/(?:^|[._-])slow(?:[._-]|$)/iu.test(path.posix.basename(file)))
    const collectedBy = new Map<string, string[]>()
    for (const [name, config] of Object.entries(configs)) {
      const files = globSync(config.test?.include ?? [], {
        cwd: repositoryRoot,
        ignore: config.test?.exclude ?? [],
      })
      for (const file of files) collectedBy.set(file, [...(collectedBy.get(file) ?? []), name])
    }
    const mismatches = discovered
      .map(file => ({ file, owner: ownerForTestPath(file), collectedBy: collectedBy.get(file) ?? [] }))
      .filter(entry => entry.collectedBy.length !== 1 || entry.collectedBy[0] !== entry.owner)
    expect(mismatches).toEqual([])
  })
})
