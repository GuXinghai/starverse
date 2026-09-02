import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src', 'next', 'generation-v2', 'model-facts')
const productionFiles = fs.readdirSync(root)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))

describe('Canonical Source Facts Goal 2C boundary', () => {
  it('does not import downstream resolution, runtime, compiler authorization, or encoding authority', () => {
    const forbidden = [
      'resolvedCapabilityV2', 'canonicalModelFactsV2', 'runtimeCapabilitySnapshotV2',
      'encodingCoverageRegistryV2', 'generationV2CapabilityResolutionService',
    ]
    for (const file of productionFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      for (const token of forbidden) expect(source, `${file} imports ${token}`).not.toContain(token)
    }
  })

  it('does not calculate final capabilityRevision or cross-source winners', () => {
    for (const file of productionFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      expect(source, `${file} contains downstream capabilityRevision`).not.toMatch(/\bcapabilityRevision\b/u)
      expect(source, `${file} contains cross-source winner logic`).not.toMatch(/provider_native\s*>\s*models_dev/u)
    }
  })
})
