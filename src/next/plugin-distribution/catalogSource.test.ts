import { describe, expect, it } from 'vitest'
import { validateOfficialCatalogSource } from './index'

describe('validateOfficialCatalogSource', () => {
  it('accepts bundled_static source', () => {
    const result = validateOfficialCatalogSource({ kind: 'bundled_static', sourceRef: 'catalog_v1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.kind).toBe('bundled_static')
  })

  it('accepts local_official_fixture source', () => {
    const result = validateOfficialCatalogSource({ kind: 'local_official_fixture', sourceRef: 'fixture_v1' })
    expect(result.ok).toBe(true)
  })

  it('accepts dev_fixture only when test/dev is allowed', () => {
    const blocked = validateOfficialCatalogSource({ kind: 'dev_fixture', sourceRef: 'dev_v1' })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.diagnostics.map((diagnostic) => diagnostic.code)).toContain('dev_fixture_not_allowed')
    }

    const allowed = validateOfficialCatalogSource(
      { kind: 'dev_fixture', sourceRef: 'dev_v1' },
      { allowDevFixtures: true }
    )
    expect(allowed.ok).toBe(true)
  })

  it.each(['remote_url', 'user_url', 'marketplace_url'])('rejects %s source', (kind) => {
    const result = validateOfficialCatalogSource({ kind, sourceRef: 'catalog_v1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('remote_source_not_allowed')
  })

  it('rejects third_party source', () => {
    const result = validateOfficialCatalogSource({ kind: 'third_party', sourceRef: 'catalog_v1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('third_party_source_not_allowed')
  })

  it('does not leak absolute paths in diagnostics', () => {
    const result = validateOfficialCatalogSource({
      kind: 'bundled_static',
      sourceRef: 'C:\\Users\\me\\catalog.json',
      label: 'C:\\Users\\me\\catalog.json',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\me\\catalog.json')
  })
})
