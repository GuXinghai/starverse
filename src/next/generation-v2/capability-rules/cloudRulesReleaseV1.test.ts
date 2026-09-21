import { describe, expect, it } from 'vitest'
import {
  CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
  CLOUD_RULES_RELEASE_ASSET_NAME_V1,
  compareCloudRulesStableSemVerV1,
  computeCloudRulesContentRevisionV1,
  decodeCloudRulesReleaseDocumentV1,
  parseCloudRulesStableSemVerV1,
  selectCloudRulesReleaseAssetV1,
  selectHighestCloudRulesReleaseV1,
  validateCloudRulesReleasePublicationV1,
} from './cloudRulesReleaseV1'

function rule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'rule.reasoning',
    label: null,
    description: null,
    priority: 0,
    configured: 'default',
    providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default',
    selector: { kind: 'exact', nativeModelIds: ['gpt-5-mini', 'gpt-5'] },
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
    evidence: null,
    ...overrides,
  }
}

function pack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    packId: 'pack.reasoning',
    displayName: 'Reasoning facts',
    description: null,
    priority: 0,
    mode: 'no_control',
    target: 'enabled',
    rules: [rule()],
    ...overrides,
  }
}

function document(
  packs: readonly Record<string, unknown>[] = [pack()],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    releaseVersion: '1.2.3',
    contentRevision: computeCloudRulesContentRevisionV1(packs),
    packs,
    ...overrides,
  }
}

function release(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 100,
    tag_name: 'cloud-rules-v1.2.3',
    html_url: 'https://github.com/GuXinghai/starverse/releases/tag/cloud-rules-v1.2.3',
    name: 'Cloud Rules 1.2.3',
    draft: false,
    prerelease: false,
    published_at: '2026-09-21T00:00:00.000Z',
    assets: [{ id: 200, name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded',
      url: 'https://api.github.com/repos/GuXinghai/starverse/releases/assets/200',
      browser_download_url: 'https://github.com/GuXinghai/starverse/releases/download/cloud-rules-v1.2.3/starverse-cloud-rules.json',
      size: 1024, digest: 'sha256:github-metadata-only' }],
    body: 'unrelated GitHub field',
    ...overrides,
  }
}

describe('Cloud Rules Release V1', () => {
  it('parses only canonical stable SemVer with safe non-negative components', () => {
    expect(parseCloudRulesStableSemVerV1('0.0.0')).toEqual({
      major: 0, minor: 0, patch: 0, value: '0.0.0',
    })
    expect(parseCloudRulesStableSemVerV1('9007199254740991.0.1').major)
      .toBe(Number.MAX_SAFE_INTEGER)
    for (const value of ['1.02.3', '1.2', '1.2.3.4', '1.2.3-alpha', '1.2.3+build',
      '-1.2.3', '9007199254740992.0.0']) {
      expect(() => parseCloudRulesStableSemVerV1(value)).toThrow()
    }
    expect(compareCloudRulesStableSemVerV1('1.10.0', '1.9.99')).toBeGreaterThan(0)
    expect(compareCloudRulesStableSemVerV1('2.0.0', '2.0.0')).toBe(0)
  })

  it('selects the highest stable Cloud Rules release and ignores unrelated or malformed entries', () => {
    const selected = selectHighestCloudRulesReleaseV1([
      release({ tag_name: 'v9.9.9' }),
      release({ tag_name: 'cloud-rules-v9.0.0', draft: true }),
      release({ tag_name: 'cloud-rules-v8.0.0', prerelease: true }),
      { tag_name: 'cloud-rules-v7.0', draft: false, prerelease: false, assets: [] },
      release({ tag_name: 'cloud-rules-v1.10.0' }),
      release({ tag_name: 'cloud-rules-v1.9.99' }),
    ])
    expect(selected?.releaseVersion).toBe('1.10.0')
    expect(() => selectHighestCloudRulesReleaseV1([
      release({ tag_name: 'cloud-rules-v1.0.0' }),
      release({ tag_name: 'cloud-rules-v2.0.0', assets: null }),
    ])).toThrow()
  })

  it('requires exactly one uploaded fixed-name asset', () => {
    const selected = selectHighestCloudRulesReleaseV1([release()])!
    expect(selectCloudRulesReleaseAssetV1(selected)).toMatchObject({
      assetId: '200', name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded',
      sizeBytes: 1024,
    })
    expect(() => selectCloudRulesReleaseAssetV1({
      ...selected, assets: [],
    })).toThrow()
    expect(() => selectCloudRulesReleaseAssetV1({
      ...selected,
      assets: [
        selected.assets[0]!,
        { ...selected.assets[0]!, assetId: '201' },
      ],
    })).toThrow()
    expect(() => selectCloudRulesReleaseAssetV1({
      ...selected,
      assets: [{ ...selected.assets[0]!, state: 'new' }],
    })).toThrow()
  })

  it('decodes a closed envelope, binds tag/document versions, and returns frozen ownership data', () => {
    const rawDocument = document()
    const publication = validateCloudRulesReleasePublicationV1({
      release: release(), document: rawDocument,
    })
    expect(publication.document.releaseVersion).toBe('1.2.3')
    expect(publication.ownershipSnapshot.ownership).toBe('cloud')
    expect(publication.ownershipSnapshot.ownerId).toBe(CLOUD_RULES_OFFICIAL_OWNER_ID_V1)
    expect(Object.isFrozen(publication)).toBe(true)
    expect(Object.isFrozen(publication.document)).toBe(true)
    expect(Object.isFrozen(publication.document.packs)).toBe(true)
    expect(() => decodeCloudRulesReleaseDocumentV1({ ...rawDocument, metadata: true })).toThrow()
    expect(() => validateCloudRulesReleasePublicationV1({
      release: release({ tag_name: 'cloud-rules-v1.2.4' }), document: rawDocument,
    })).toThrow()
  })

  it('rejects duplicate Pack and globally duplicate Rule identities', () => {
    expect(() => decodeCloudRulesReleaseDocumentV1(document([
      pack({ packId: 'pack.same' }), pack({ packId: 'pack.same', rules: [rule({ ruleId: 'rule.other' })] }),
    ]))).toThrow()
    expect(() => decodeCloudRulesReleaseDocumentV1(document([
      pack({ packId: 'pack.one' }), pack({ packId: 'pack.two', rules: [rule()] }),
    ]))).toThrow()
  })

  it('normalizes object keys, Pack order, Rule order, and unordered exact selectors deterministically', () => {
    const firstPacks = [
      pack({ packId: 'pack.z', rules: [rule({ ruleId: 'rule.z' })] }),
      pack({ packId: 'pack.a', rules: [rule({ ruleId: 'rule.b' }), rule({ ruleId: 'rule.a' })] }),
    ]
    const secondPacks = [
      {
        rules: [rule({ selector: { kind: 'exact', nativeModelIds: ['gpt-5', 'gpt-5-mini'] }, ruleId: 'rule.a' }),
          rule({ ruleId: 'rule.b' })],
        target: 'enabled', mode: 'no_control', priority: 0, description: null,
        displayName: 'Reasoning facts', packId: 'pack.a', schemaVersion: 1,
      },
      pack({ packId: 'pack.z', rules: [rule({ ruleId: 'rule.z' })] }),
    ]
    const first = decodeCloudRulesReleaseDocumentV1(document(firstPacks))
    const second = decodeCloudRulesReleaseDocumentV1(document(secondPacks))
    expect(first.contentRevision).toBe(second.contentRevision)
    expect(first.packs.map((entry) => entry.packId)).toEqual(['pack.a', 'pack.z'])
    expect(first.packs[0]?.rules.map((entry) => entry.ruleId)).toEqual(['rule.a', 'rule.b'])
  })

  it('rejects content drift when the declared revision does not match normalized complete Packs', () => {
    const original = document()
    expect(() => decodeCloudRulesReleaseDocumentV1(document([
      pack({ priority: 1 }),
    ], { contentRevision: original.contentRevision }))).toThrow()
  })
})
