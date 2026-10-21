import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { listReviewedProviderContractDefinitionsV2 } from '../../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { clearRequestAdaptationsV2, recordRequestAdaptationV2 } from '../../../src/core/generation-v2/compiler/requestAdaptationV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from './openAIResponsesNativeHistoryV2Repo'
import { readOriginalGenerationAttachmentsV2, registerGenerationHistoryByteReaderV2 } from './portableGenerationHistoryV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 as transaction } from './generationV2AuthorityTransactionInternal'

const HASH = 'a'.repeat(64)
const databases: BetterSqlite3.Database[] = []
afterEach(() => { clearRequestAdaptationsV2('operation:1'); while (databases.length) databases.pop()!.close() })

function fixture(options: { mime?: string; include?: boolean; wrongHash?: boolean; wrongAsset?: boolean } = {}) {
  const db = new BetterSqlite3(':memory:'); databases.push(db); applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare("INSERT INTO project_v2 VALUES('project:1','Project',1,1)").run()
  db.prepare("INSERT INTO conversation_v2 VALUES('conversation:1','project:1','Conversation',2,2)").run()
  db.prepare("INSERT INTO branch_v2 VALUES('branch:1','conversation:1',NULL,NULL,12,12,NULL,NULL)").run()
  const assets = new AttachmentAssetV2Repo(db)
  const sourceBytes = Buffer.from('source image')
  const maskBytes = Buffer.from('PNG mask image')
  const attachments = [sourceBytes, maskBytes].map((bytes, index) => {
    const mime = index ? options.mime ?? 'image/png' : 'image/png'
    const blob = assets.recordBlobFromBytes(bytes, mime)
    assets.createAsset({ assetId: `asset:${index}`, filename: `${index}.png`, sourceKind: 'user_import', assetKind: 'image' })
    const revision = assets.appendSourceRevision({ assetId: `asset:${index}`, assetRevisionId: `revision:${index}`, blob })
    return { kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
      assetSha256: revision.blob.sha256.value, include: index ? options.include ?? true : true,
      sendAs: 'image_reference', conversion: 'none' }
  })
  const maskAsset = { assetId: options.wrongAsset ? 'asset:other' : attachments[1].assetId,
    assetRevisionId: attachments[1].assetRevisionId, assetSha256: options.wrongHash ? HASH : attachments[1].assetSha256 }
  const definition = listReviewedProviderContractDefinitionsV2().find(value => value.protocolContractId.value === 'openai-responses-v1')!
  const binding = { credentialScopeId: 'credential:test', providerId: definition.providerId.value,
    endpointProfileId: 'profile:openai', endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1',
      descriptors: [{ endpointId: 'endpoint:main', descriptorRevision: 'descriptor:1' }] },
    protocolContractId: definition.protocolContractId.value, contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
    modelId: 'gpt-4.1-mini', operation: 'text' }
  const cap = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
    resolvedAt: '2026-10-20T00:00:00.000Z', binding,
    evidence: [{ evidenceId: 'test.support', kind: 'official_documentation', effect: 'supports', sourceRef: 'https://example.test',
      verifiedAt: '2026-10-20T00:00:00.000Z', contentDigest: HASH }],
    fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'missing', constraints: [], evidenceIds: [] })), tools: [],
    continuation: { kind: 'none', evidenceIds: ['test.support'] } }))
  db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(cap.snapshotHash.value,
    cap.revision.value, cap.canonicalJson, cap.evidenceDigest.value, cap.semanticFieldsDigest.value)
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms) VALUES('question:1','conversation:1','branch:1','user','completed',NULL,NULL,NULL,1,100,100),
    ('answer:1','conversation:1','branch:1','assistant','streaming','question:1','question:1','answer:1',2,101,101)`).run()
  db.prepare("UPDATE message_body_v2 SET body_text='edit source' WHERE message_id='question:1'").run()
  db.prepare("UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:1'").run()
  db.prepare("INSERT INTO branch_choice_v2 VALUES('branch:1','conversation:1','question:1','answer:1',102)").run()
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: 'answer:1', operationId: 'operation:1',
    semanticIntent: { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      tools: { mode: 'disabled' }, image: { mode: 'generate', action: 'edit', maskAsset }, attachments, providerExtension: { kind: 'none' } },
    resolvedConfigRevisions: [{ ownerKind: 'global', ownerId: 'global', revision: 'config:1' }], providerBinding: binding,
    capabilityBinding: { capabilityRevision: cap.revision.value, evidenceDigest: cap.evidenceDigest.value,
      semanticFieldsDigest: cap.semanticFieldsDigest.value, snapshotHash: cap.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
  }))
  transaction(db, context => new GenerationExecutionV2Repo(db).insertOperationAndSnapshot(context, {
    operationId: 'operation:1', actionKind: 'initial_send', branchId: 'branch:1', conversationId: 'conversation:1', questionId: 'question:1',
    sourceAnswerId: null, targetAnswerId: 'answer:1', snapshot: snapshot.canonicalJson, commandFingerprint: HASH, createdAtMs: 110,
  }))
  const issued: Uint8Array[] = []
  registerGenerationHistoryByteReaderV2(db, revision => {
    const bytes = Buffer.from(revision.assetId.value === 'asset:1' ? maskBytes : sourceBytes); issued.push(bytes); return bytes
  })
  return { db, sourceBytes, maskBytes, issued, snapshot }
}

describe('OpenAI image mask history authority', () => {
  it('reads the selected immutable PNG separately and excludes it from ordinary input images', () => {
    const { db, sourceBytes, maskBytes, issued } = fixture()
    transaction(db, context => {
      const fact = new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1')
      expect(fact.inputImageMask).toEqual({ imageUrl: `data:image/png;base64,${maskBytes.toString('base64')}` })
      expect(fact.clientItems).toEqual([{ role: 'user', content: [
        { type: 'input_text', text: 'edit source' },
        { type: 'input_image', image_url: `data:image/png;base64,${sourceBytes.toString('base64')}` },
      ] }])
      expect(issued).toHaveLength(2)
      expect(issued.every(bytes => bytes.every(value => value === 0))).toBe(true)
    })
  })

  it.each([
    { include: false }, { wrongHash: true }, { wrongAsset: true }, { mime: 'image/jpeg' },
  ])('rejects a mask without an exact included PNG authority: %j', options => {
    const { db } = fixture(options)
    expect(() => transaction(db, context => new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1'))).toThrow()
  })

  it.each([false, true])('excludes only the canonical mask from portable history references (requested intent=%s)', requested => {
    const { db, snapshot } = fixture()
    transaction(db, () => {
      if (requested) recordRequestAdaptationV2('operation:1', { path: 'requestedIntent', outcome: 'preserved',
        reason: 'test_requested_intent', source: JSON.parse(snapshot.canonicalJson).semanticIntent })
      const references = readOriginalGenerationAttachmentsV2(db, snapshot)
      expect(references).toHaveLength(1)
      expect(references[0].kind === 'managed_file' && references[0].assetId.value).toBe('asset:0')
    })
  })

  it('keeps every ordinary portable reference when the canonical mask identity does not match', () => {
    const { db, snapshot } = fixture({ wrongHash: true })
    expect(readOriginalGenerationAttachmentsV2(db, snapshot)).toHaveLength(2)
  })
})
