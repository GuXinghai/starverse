import { describe, expect, it } from 'vitest'
import overrides from '../tests/test-partition-overrides.json'
import unit from '../vitest.unit.config'
import ui from '../vitest.ui.config'
import integration from '../vitest.integration.config'
import { SLOW_TEST_GLOBS } from '../vitest.shared'

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
})
