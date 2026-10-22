import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectGenerationV2SchemaBundle } from './schemaComposerV2'

const roots: string[] = []
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }) })

// Copies every schema fragment with one line-ending style, so the result does
// not depend on how this checkout stores the SQL files.
function schemaRootWithLineEndings(eol: '\n' | '\r\n'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-schema-eol-'))
  roots.push(root)
  const target = path.join(root, 'infra', 'db', 'v2')
  fs.mkdirSync(target, { recursive: true })
  const source = path.resolve('infra/db/v2')
  for (const name of fs.readdirSync(source).filter(file => file.endsWith('.sql'))) {
    const text = fs.readFileSync(path.join(source, name), 'utf8').replace(/\r\n?/gu, '\n')
    fs.writeFileSync(path.join(target, name), eol === '\n' ? text : text.replace(/\n/gu, '\r\n'))
  }
  return root
}

describe('generation V2 schema digest', () => {
  it('is stable for identical bytes', () => {
    const root = schemaRootWithLineEndings('\n')
    expect(inspectGenerationV2SchemaBundle(root).schemaDigest).toBe(inspectGenerationV2SchemaBundle(root).schemaDigest)
  })

  // P2b-01 (+P8-01): the digest hashes raw fragment bytes, so the same schema
  // checked out with CRLF line endings gets a different identity, and an
  // identical database is classified as a schema mismatch. Remove `.fails` when fixed.
  it.fails('P2b-01: identifies the same schema identically with LF and CRLF line endings', () => {
    expect(inspectGenerationV2SchemaBundle(schemaRootWithLineEndings('\r\n')).schemaDigest)
      .toBe(inspectGenerationV2SchemaBundle(schemaRootWithLineEndings('\n')).schemaDigest)
  })
})
