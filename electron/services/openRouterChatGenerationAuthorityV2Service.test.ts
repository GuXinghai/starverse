import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import {
  MaterializedCapabilityRuleProjectionV2Repo,
  MaterializedCapabilityRuleProjectionV2RepoError,
} from '../../infra/db/repo/materializedCapabilityRuleProjectionV2Repo'
import { isOpenRouterChatAttachmentAdmissibleV2 } from './openRouterChatGenerationAuthorityV2Service'

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'managed_file', include: true, sendAs: 'inline_text', conversion: 'plain_text',
    assetId: { value: 'asset' }, assetRevisionId: { value: 'revision' }, assetSha256: { value: 'sha' },
    ...overrides,
  } as never
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    revisionKind: 'derived', conversionKind: 'plain_text', assetKind: 'file',
    blob: { mime: 'text/markdown' },
    ...overrides,
  } as never
}

describe('isOpenRouterChatAttachmentAdmissibleV2', () => {
  it('accepts only a verified plain-text derived revision for inline text', () => {
    expect(isOpenRouterChatAttachmentAdmissibleV2({ attachment: attachment(), revision: revision() })).toBe(true)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment(), revision: revision({ revisionKind: 'source', conversionKind: 'none' }),
    })).toBe(false)
  })

  it('checks PDF provenance without independently deciding model support', () => {
    const convertedPdf = attachment({ sendAs: 'converted_document', conversion: 'pdf' })
    const pdfRevision = revision({ conversionKind: 'pdf', blob: { mime: 'application/pdf' } })
    expect(isOpenRouterChatAttachmentAdmissibleV2({ attachment: convertedPdf, revision: pdfRevision })).toBe(true)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: convertedPdf, revision: revision({ conversionKind: 'plain_text', blob: { mime: 'application/pdf' } }),
    })).toBe(false)
  })

  it('does not permit cross-mode PDF or text substitution', () => {
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment({ sendAs: 'provider_file', conversion: 'none' }),
      revision: revision({ blob: { mime: 'application/pdf' } }),
    })).toBe(false)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment({ sendAs: 'inline_text', conversion: 'plain_text' }),
      revision: revision({ conversionKind: 'pdf', blob: { mime: 'application/pdf' } }),
    })).toBe(false)
  })
})

describe('OpenRouter materialized capability-rule authority', () => {
  it('fails closed when the active Rules source or exact subject is unavailable', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const repo = new MaterializedCapabilityRuleProjectionV2Repo(db)
      const identity = { providerId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
        nativeModelId: 'google/gemini-3.1-flash-image' }
      expect(() => repo.resolveForIdentity(identity)).toThrowError(
        expect.objectContaining<Partial<MaterializedCapabilityRuleProjectionV2RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_UNAVAILABLE',
        }),
      )

      seedMaterializedCapabilityRulesForTestV1(db, {
        ownershipSnapshots: [],
        subjectCandidates: [{
          subject: { providerAuthorityId: 'openrouter', endpointProfileId: identity.endpointProfileId,
            nativeModelId: identity.nativeModelId },
          proof: { kind: 'provider_native_catalog', providerKey: 'openrouter', scopeId: 'scope:test',
            credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
            endpointProfileId: identity.endpointProfileId, operationContractId: 'openrouter-chat-models-v1',
            catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) },
        }],
      })
      expect(() => repo.resolveForIdentity({ ...identity, nativeModelId: 'google/missing-image-model' }))
        .toThrowError(expect.objectContaining<Partial<MaterializedCapabilityRuleProjectionV2RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_SUBJECT_STALE',
        }))
    } finally {
      db.close()
    }
  })
})
