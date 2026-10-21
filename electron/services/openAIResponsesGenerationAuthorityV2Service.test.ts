import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { createHash } from 'node:crypto'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { createOpenAIResponsesPlainTextInitialSendCoordinatorV2 } from './openAIResponsesPlainTextInitialSendCoordinatorV2'
import { createOpenAIResponsesPlainTextRegenerateCoordinatorV2 } from './openAIResponsesPlainTextRegenerateCoordinatorV2'
import { createOpenAIResponsesPlainTextEditResendCoordinatorV2 } from './openAIResponsesPlainTextEditResendCoordinatorV2'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'
import type { CapabilityRuleCoreRuleV1, CapabilityRuleOwnershipSnapshotV1 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV1'
import { createGenerationV2CapabilityResolutionService } from './generationV2CapabilityResolutionService'
import { createOpenAIResponsesStreamRunnerV2 } from './openAIResponsesStreamRunnerV2'
import { createOpenAIResponsesToolContinuationCoordinatorV2 } from './openAIResponsesToolContinuationCoordinatorV2'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { OpenAIResponsesArtifactsV2Repo } from '../../infra/db/repo/openAIResponsesArtifactsV2Repo'
import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import { GenerationNativeCompletionReceiptV2Repo } from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { loadNativeArtifactJsonV2 } from '../../infra/db/repo/nativeArtifactStorageV2'
import { loadInterruptedReplayJsonV2 } from '../../infra/db/repo/interruptedReplayStorageV2'
import { createGenerationNativeCompletionRecoveryWorkSourceV2, recoverPendingGenerationNativeCompletionsV2 } from './generationNativeCompletionV2'
import { GenerationOperationRuntimeRegistryV2 } from './generationOperationRuntimeRegistryV2'
import { UserCapabilityRulesV2Service } from './userCapabilityRulesV2Service'
import { createReviewedRequestRulePacksV2 } from '../../scripts/rules/reviewedRequestRulePacksV2'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { createOpenAIResponsesGenerationV2Runtime } from './openAIResponsesGenerationV2Runtime'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { registerGenerationHistoryByteReaderV2 } from '../../infra/db/repo/portableGenerationHistoryV2'
import { FileTypeDetectionV2Repo } from '../../infra/db/repo/fileTypeDetectionV2Repo'
import { detectBasicFileTypeV2 } from '../../infra/files/fileTypeRuntimeBoundary'
import { patchImageGenerationSemanticV2 } from '../../src/ui-app/app/imageGenerationSemanticV2'
import { projectGenerationV2SemanticLayerToSessionConfig } from '../../src/ui-app/app/generationV2SessionConfigProjection'
import { createCloudRulesUpgradeV2 } from '../../scripts/rules/cloudRulesUpgradeV2'
import { CloudRulesApplicationV1Service } from './cloudRulesApplicationV1Service'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { CloudRulesDistributionV1Repo, prepareCloudRulesCandidateV1 } from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { computeCloudRulesContentRevisionV1, validateCloudRulesReleasePublicationV1 } from '../../src/core/generation-v2/capability-rules/cloudRulesReleaseV1'

const scope = `credential-scope-v2:${'b'.repeat(64)}` as never

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))
const transportMocks = vi.hoisted(() => ({ leases: new WeakSet<object>() }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && transportMocks.leases.has(value)),
}))

function exactRule(input: Readonly<{
  ruleId: string
  nativeModelId: string
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
}>): CapabilityRuleCoreRuleV1 {
  return { ruleId: input.ruleId, label: null, description: null, priority: 0, configured: 'on',
    providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
    selector: { kind: 'exact', nativeModelIds: [input.nativeModelId] },
    assertion: { path: input.path, value: input.value }, evidence: null }
}

function cloudSnapshot(rules: readonly CapabilityRuleCoreRuleV1[]): CapabilityRuleOwnershipSnapshotV1 {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'test:cloud', packs: [{
    schemaVersion: 1, packId: 'pack.test.openai-responses', displayName: 'OpenAI Responses test',
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules,
  }] }
}

function subjectCandidates(modelIds: readonly string[]) {
  return modelIds.map((nativeModelId) => ({
    subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId },
    proof: { kind: 'provider_native_catalog' as const, providerKey: 'openai_responses' as const,
      scopeId: 'scope:test:openai', credentialScopeId: scope, credentialRevision: 1,
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
      activeSnapshotDigest: 'c'.repeat(64) },
  }))
}

function seedCatalog(db: BetterSqlite3.Database, modelIds: readonly string[]): void {
  const catalog = new ModelCatalogV2Repo(db, () => 100)
  const catalogScope = Object.freeze({ providerKey: 'openai_responses' as const, credentialScopeId: scope,
    endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', category: '' })
  catalog.beginSync(catalogScope, 'attempt:openai')
  catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:openai', responseDigest: 'c'.repeat(64),
    observedAtMs: 100, applyMode: 'automatic', items: modelIds.map((modelId) => ({
      providerKey: 'openai_responses' as const, nativeModelId: modelId, modelId,
      modelKey: `openai_responses::${modelId}`, displayName: modelId,
      raw: { schemaVersion: 1 as const, buckets: [{ source: 'models' as const, fetchedAtMs: 100,
        baseUrl: 'https://api.openai.com/v1', payload: { observation: {
          schemaVersion: 2 as const, providerKey: 'openai_responses' as const, nativeModelId: modelId,
          endpointId: 'openai-responses-official', observedAtMs: 100,
          rawProviderRecord: { id: modelId, max_tokens: 65_536 }, facts: {},
          provenance: { sourceKind: 'provider_api' as const, sourceLabel: 'openai_responses_models_api',
            observedAtMs: 100, parserVersion: 2 as const },
        } } }] },
    })) })
}

function database(modelIds: readonly string[], rules: readonly CapabilityRuleCoreRuleV1[]): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  seedCatalog(db, modelIds)
  seedMaterializedCapabilityRulesForTestV1(db, {
    ownershipSnapshots: [cloudSnapshot(rules)], subjectCandidates: subjectCandidates(modelIds),
  })
  return db
}

function credentialService() {
  return {
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never),
  } as never
}

function request(modelId: string) {
  return { providerId: 'openai_responses', credentialRevision: 1, credentialScopeId: scope,
    endpointProfileId: 'openai-api-v1', protocolId: 'openai-responses-v1', modelId, operation: 'text' as const }
}

function streamCredentials() {
  return {
    ...credentialService() as object,
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const lease = { providerKey: 'openai_responses', credentialScopeId: scope, credential: 'test-only', assertCurrent: () => undefined }
      transportMocks.leases.add(lease)
      try { return await consume(lease as never) } finally { transportMocks.leases.delete(lease) }
    },
  } as never
}

const streamReasoning = { id: 'rs', type: 'reasoning', status: 'completed', summary: [], encrypted_content: 'done-A' }
const streamMessage = { id: 'msg', type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'answer', annotations: [] }] }
function streamFrame(type: string, sequence_number: number, value: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number, ...value })}\n\n`
}
function terminalFrame(status: 'completed' | 'failed' | 'incomplete', output: unknown[], sequence = 4) {
  return streamFrame(`response.${status}`, sequence, { response: {
    id: 'resp', object: 'response', model: 'synthetic', created_at: 1, completed_at: status === 'completed' ? 2 : null,
    status, output, usage: null,
    error: status === 'failed' ? { code: 'server_error', message: 'provider failed' } : null,
    incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
  } })
}

describe('OpenAI hosted image parameter offline authority', () => {
  it.each(['synthetic', 'gpt-4.1'])('compiles image controls and raw parameters after the formal Cloud V1 to V2 upgrade: %s', async model => {
    const db = database([model], [])
    try {
      const packs = cloudSnapshot([]).packs
      const v1 = { schemaVersion: 1, releaseVersion: '1.0.3', contentRevision: computeCloudRulesContentRevisionV1(packs), packs }
      const v2 = createCloudRulesUpgradeV2(v1, '2.0.0', [{ providerAuthorityId: 'openai',
        endpointProfileId: 'openai-api-v1', protocolContractId: 'openai-responses-v1', nativeModelIds: [model] }])
      const subjects = buildAuthoritativeModelSubjectSetV1(subjectCandidates([model]))
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 100)
      for (const document of [v1, v2]) {
        const tag = `cloud-rules-${document.schemaVersion === 2 ? 'schema2-' : ''}v${document.releaseVersion}`
        const prepared = prepareCloudRulesCandidateV1({ publication: validateCloudRulesReleasePublicationV1({
          release: { id: 100 + document.schemaVersion, tag_name: tag,
            html_url: `https://github.com/GuXinghai/starverse/releases/tag/${tag}`, name: tag,
            body: 'Offline test only', draft: false, prerelease: false, published_at: '2026-10-20T00:00:00.000Z',
            assets: [{ id: 200 + document.schemaVersion, name: 'starverse-cloud-rules.json', state: 'uploaded',
              url: 'https://api.github.com/repos/GuXinghai/starverse/releases/assets/200',
              browser_download_url: `https://github.com/GuXinghai/starverse/releases/download/${tag}/starverse-cloud-rules.json`,
              size: 100, digest: null }] }, document }),
          rawAssetSha256: createHash('sha256').update(JSON.stringify(document)).digest('hex'), fetchedAtMs: 100 })
        new CloudRulesDistributionV1Repo(db).publishSuccessfulCheck({ checkedAtMs: 100, candidate: prepared })
        if (document.schemaVersion === 1) await service.applyBootstrapCandidate()
        else await service.applyCandidate({ expectedCandidateRecordRevision: prepared.candidateRecordRevision,
          expectedAppliedRecordRevision: new CloudRulesApplicationV1Repo(db).readState().appliedRecordRevision })
      }
      const command = await streamFixture(db, false, model, { schemaVersion: 2,
        reasoning: { mode: 'disabled' }, requestedParameters: { temperature: { mode: 'omit', source: 'conversation' } },
        image: { mode: 'generate', toolModel: 'gpt-image-1-mini', action: 'generate', toolChoice: 'required',
          format: 'webp', background: 'transparent', outputCompression: 73, partialImages: 1, quality: 'low' } })
      const body = JSON.parse(command.preparedRequest.body.copyUtf8Text())
      expect(body.tools).toContainEqual(expect.objectContaining({ type: 'image_generation', model: 'gpt-image-1-mini',
        action: 'generate', output_format: 'webp', output_compression: 73 }))
      expect(body).not.toHaveProperty('temperature')
      expect(body.tool_choice).toEqual({ type: 'image_generation' })
      expect(new CloudRulesApplicationV1Repo(db).readState().applied?.document.schemaVersion).toBe(2)
    } finally { db.close() }
  })

  it('preserves a PNG mask through authority, compatibility, snapshot, request plan and wire proof', async () => {
    const db = database(['synthetic'], [exactRule({ ruleId: 'synthetic.image', nativeModelId: 'synthetic',
      path: 'image.generation.support', value: { kind: 'support', value: 'supported' } })])
    try {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=', 'base64')
      const assets = new AttachmentAssetV2Repo(db)
      const attachments = ['source', 'mask'].map((name) => {
        const blob = assets.recordBlobFromBytes(png, 'image/png')
        assets.createAsset({ assetId: `asset:${name}`, filename: `${name}.png`, sourceKind: 'user_import', assetKind: 'image' })
        const revision = assets.appendSourceRevision({ assetId: `asset:${name}`, assetRevisionId: `revision:${name}`, blob })
        const detection = detectBasicFileTypeV2({ bytes: png, filename: `${name}.png`, declaredMime: 'image/png', detectionTrigger: 'upload' })
        const detections = new FileTypeDetectionV2Repo(db)
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => detections.createPendingInAuthorityTransaction(context, {
          assetRevisionId: revision.assetRevisionId.value, assetSha256: revision.blob.sha256.value, attemptId: `detection:${name}`,
        }))
        detections.completeReady({ assetRevisionId: revision.assetRevisionId.value, attemptId: `detection:${name}`, revision: 1,
          verdict: detection.verdict, staticPolicy: detection.staticPolicy })
        return { kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
          assetSha256: revision.blob.sha256.value, include: true, sendAs: 'image_reference', conversion: 'none' }
      })
      const maskAsset = { assetId: attachments[1].assetId, assetRevisionId: attachments[1].assetRevisionId,
        assetSha256: attachments[1].assetSha256 }
      registerGenerationHistoryByteReaderV2(db, () => Buffer.from(png))
      const oldCanonical = JSON.parse(JSON.stringify({ schemaVersion: 2, reasoning: { mode: 'disabled' },
        image: { mode: 'generate', format: 'webp' } }))
      const binding = { providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
        protocolContractId: 'openai-responses-v1', operation: 'text', modelId: 'synthetic' }
      expect(projectGenerationV2SemanticLayerToSessionConfig(oldCanonical, 'openai_responses', binding)
        .patch.generationParams?.detail).toBeDefined()
      const saved = patchImageGenerationSemanticV2(oldCanonical,
        { mode: 'generate', action: 'edit', toolModel: 'gpt-image-1', inputFidelity: 'high', maskAsset }, binding)
      expect(saved).not.toHaveProperty('requestedParameters')
      expect(new CapabilityRuleCoreV1Repo(db).listOwnershipSnapshots()).toHaveLength(1)
      const command = await streamFixture(db, false, 'synthetic', saved, attachments)
      const body = JSON.parse(command.preparedRequest.body.copyUtf8Text())
      expect(body.tools).toEqual([{ type: 'image_generation', action: 'edit', model: 'gpt-image-1', input_fidelity: 'high',
        input_image_mask: { image_url: `data:image/png;base64,${png.toString('base64')}` } }])
      expect(body.input.at(-1).content.filter((part: { type: string }) => part.type === 'input_image')).toHaveLength(1)
      expect(command.execution.snapshot.semanticIntent.image).toMatchObject({ maskAsset: {
        assetId: { value: maskAsset.assetId }, assetRevisionId: { value: maskAsset.assetRevisionId } } })
      expect(command.execution.snapshot.requestPlan).toBeDefined()
      expect(command.preparedRequest.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'image.maskAsset', nativeField: 'tools[].input_image_mask', disposition: 'encoded' }),
      ]))
      expect(command.preparedRequest.wireEncodingProof).toBeDefined()
    } finally { db.close() }
  })
  it('still rejects V2 raw request parameters under a V1-only rules installation', async () => {
    const db = database(['synthetic'], [])
    try {
      await expect(streamFixture(db, false, 'synthetic', { schemaVersion: 2,
        requestedParameters: { temperature: { mode: 'omit', source: 'conversation' } } }))
        .rejects.toThrow('GENERATION_V2_COMMAND_FACTS_INVALID')
      expect(db.prepare('SELECT count(*) AS n FROM generation_request_v2').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })
  it('preserves the selected chat model and consumes all explicit hosted image parameters', async () => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: {
        mode: 'generate', toolModel: 'gpt-image-2.5-flare', action: 'auto', toolChoice: 'required',
        size: { width: 1536, height: 864 }, quality: 'max', format: 'webp', background: 'opaque',
        outputCompression: 0, partialImages: 0, moderation: 'low',
      } })
      expect(JSON.parse(command.preparedRequest.body.copyUtf8Text())).toMatchObject({ model: 'synthetic',
        tool_choice: { type: 'image_generation' }, tools: [{ type: 'image_generation', model: 'gpt-image-2.5-flare',
          action: 'auto', size: '1536x864', quality: 'max', output_format: 'webp', background: 'opaque',
          output_compression: 0, partial_images: 0, moderation: 'low' }] })
      expect(command.preparedRequest.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'image.toolModel', nativeField: 'tools[].model' }),
        expect.objectContaining({ path: 'image.toolChoice', nativeField: 'tool_choice' }),
        expect.objectContaining({ path: 'image.outputCompression', nativeField: 'tools[].output_compression' }),
      ]))
    } finally { db.close() }
  })
  it('omits default fields and keeps a disabled compression choice out of PNG output', async () => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: {
        mode: 'generate', format: 'png', outputCompression: 80,
      } })
      expect(JSON.parse(command.preparedRequest.body.copyUtf8Text()).tools).toEqual([{ type: 'image_generation', output_format: 'png' }])
      expect(command.preparedRequest.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'image.outputCompression', disposition: 'accepted_no_wire', nativeField: null }),
      ]))
    } finally { db.close() }
  })
  it('rejects a function-tool choice conflict instead of replacing the selected tool', async () => {
    const db = database(['synthetic'], [])
    try {
      await expect(streamFixture(db, true, 'synthetic', { schemaVersion: 2,
        image: { mode: 'generate', toolChoice: 'required' }, tools: { mode: 'enabled', allowedToolIds: ['tool:weather'],
          toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' } }))
        .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED' })
    } finally { db.close() }
  })
})
function nativeArtifactRows(db: BetterSqlite3.Database) {
  const rows = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
    request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
    artifact_json AS artifactJson, artifact_hash AS artifactHash
    FROM generation_native_artifact_v2 ORDER BY artifact_kind`).all() as Array<{
      operationId: string; answerRootId: string; requestSequence: number; artifactKind: string
      codecVersion: number; artifactJson: string; artifactHash: string
    }>
  const raw = db.transaction(() => rows.map((row) => ({ ...row, rawJson: loadNativeArtifactJsonV2(db, {
    operationId: row.operationId, answerRootId: row.answerRootId,
    requestSequence: row.requestSequence, artifactKind: row.artifactKind,
  }, row.artifactJson, { artifactCodecVersion: row.codecVersion, artifactHash: row.artifactHash }) })))()
  return { rows, raw }
}
function loadInterruptedSnapshot(db: BetterSqlite3.Database, operationId: string) {
  const row = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
    request_sequence AS requestSequence, snapshot_json AS json, snapshot_hash AS snapshotHash
    FROM generation_interrupted_replay_v2 WHERE operation_id=?`).get(operationId) as {
      operationId: string; answerRootId: string; requestSequence: number; json: string; snapshotHash: string
    }
  const json = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, () =>
    loadInterruptedReplayJsonV2(db, { operationId: row.operationId, answerRootId: row.answerRootId,
      requestSequence: row.requestSequence }, row.json, row.snapshotHash))
  return JSON.parse(json)
}
function loadInterruptedReplay(db: BetterSqlite3.Database, answerRootId: string) {
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context =>
    new GenerationInterruptedReplayV2Repo(db).load(context, answerRootId, 'openai_responses'))
}
async function streamFixture(db: BetterSqlite3.Database, tools = false, modelId = 'synthetic', config?: Readonly<Record<string, unknown>>, commandAttachments: readonly unknown[] = []) {
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
    const graph = new ConversationGraphV2Repo(db)
    graph.createProject(context, { projectId: 'p', name: 'Stream', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'p', conversationId: 'c', branchId: 'b', title: 'Stream', branchName: null, createdAtMs: 2 })
  })
  if (tools) {
    new ToolRegistryV2Repo(db).installAndSelect({ schemaVersion: 2, definitions: [{
      toolId: 'tool:weather', kind: 'function', function: { name: 'weather', parameters: { type: 'object' } }, sideEffectPolicy: 'none',
    }] }, null)
    const configs = new GenerationConfigV2Repo(db), current = configs.getScope('conversation', 'c')
    configs.compareAndSetScope('conversation', 'c', current.configRevision.value, { schemaVersion: 2,
      tools: { mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' } })
  }
  if (config) {
    const configs = new GenerationConfigV2Repo(db)
    const current = configs.getScope('conversation', 'c')
    configs.compareAndSetScope('conversation', 'c', current.configRevision.value, config as never)
  }
  return createOpenAIResponsesPlainTextInitialSendCoordinatorV2({ db, credentialService: streamCredentials(),
    nowMs: () => 200, createGraphId: kind => `${kind}:source` }).submit({
    expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
    command: { operationId: 'operation:source', branchId: 'b', expectedHeadMessageId: null, userBody: 'Original', modelId, commandAttachments },
  })
}

describe('OpenAI Responses stream replay authority persistence', () => {
  const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII='
  const imageItem = { id: 'ig:1', type: 'image_generation_call', status: 'completed', result: imageBase64,
    action: 'generate', revised_prompt: 'A simple test image', size: '1024x1024',
    quality: 'low', output_format: 'png', background: 'opaque' }
  const imageRules = [exactRule({ ruleId: 'synthetic.image', nativeModelId: 'synthetic',
    path: 'image.generation.support', value: { kind: 'support', value: 'supported' } })]

  it('compiles a masked edit after a durable generated image without resolving its unstored tool ID', async () => {
    const db = database(['synthetic'], imageRules)
    try {
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' } })
      await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        attachmentBlobStore: { persist: vi.fn() } as never,
        fetchImpl: async () => new Response(terminalFrame('completed', [imageItem], 0),
          { headers: { 'content-type': 'text/event-stream' } }) }).run(command)
      const originalArtifacts = nativeArtifactRows(db).raw
      const png = Buffer.from(imageBase64, 'base64')
      const assets = new AttachmentAssetV2Repo(db)
      const attachments = ['next-source', 'next-mask'].map(name => {
        const blob = assets.recordBlobFromBytes(png, 'image/png')
        assets.createAsset({ assetId: `asset:${name}`, filename: `${name}.png`, sourceKind: 'user_import', assetKind: 'image' })
        const revision = assets.appendSourceRevision({ assetId: `asset:${name}`, assetRevisionId: `revision:${name}`, blob })
        const detection = detectBasicFileTypeV2({ bytes: png, filename: `${name}.png`, declaredMime: 'image/png', detectionTrigger: 'upload' })
        const detections = new FileTypeDetectionV2Repo(db)
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => detections.createPendingInAuthorityTransaction(context, {
          assetRevisionId: revision.assetRevisionId.value, assetSha256: revision.blob.sha256.value, attemptId: `detection:${name}`,
        }))
        detections.completeReady({ assetRevisionId: revision.assetRevisionId.value, attemptId: `detection:${name}`, revision: 1,
          verdict: detection.verdict, staticPolicy: detection.staticPolicy })
        return { kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
          assetSha256: revision.blob.sha256.value, include: true, sendAs: 'image_reference', conversion: 'none' }
      })
      registerGenerationHistoryByteReaderV2(db, () => Buffer.from(png))
      const configs = new GenerationConfigV2Repo(db)
      const current = configs.getScope('conversation', 'c')!
      configs.compareAndSetScope('conversation', 'c', current.configRevision.value, { schemaVersion: 2,
        image: { mode: 'generate', action: 'edit', toolModel: 'gpt-image-1-mini', quality: 'low', maskAsset: {
          assetId: attachments[1].assetId, assetRevisionId: attachments[1].assetRevisionId, assetSha256: attachments[1].assetSha256,
        } } } as never)
      const next = await createOpenAIResponsesPlainTextInitialSendCoordinatorV2({ db, credentialService: streamCredentials(), nowMs: () => 400,
        createGraphId: kind => `${kind}:next` }).submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        command: { operationId: 'operation:next', branchId: 'b', expectedHeadMessageId: 'answer:source',
          userBody: 'Edit masked region', modelId: 'synthetic', commandAttachments: attachments } })
      const body = JSON.parse(next.preparedRequest.body.copyUtf8Text())
      expect(body.store).toBe(false)
      expect(JSON.stringify(body.input)).not.toContain('image_generation_call')
      expect(body.input.at(-1).content.filter((part: { type: string }) => part.type === 'input_image')).toHaveLength(1)
      expect(body.tools[0].input_image_mask).toEqual({ image_url: `data:image/png;base64,${imageBase64}` })
      expect(nativeArtifactRows(db).raw).toEqual(originalArtifacts)
    } finally { db.close() }
  })

  it('keeps attachment proof bound to real user history during image plus function-tool continuation', async () => {
    const db = database(['synthetic'], imageRules)
    try {
      const command = await streamFixture(db, true, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' },
        tools: { mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' } })
      const call = { id: 'fc', type: 'function_call', call_id: 'call', name: 'weather', arguments: '{}', status: 'completed' }
      const first = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        attachmentBlobStore: { persist: vi.fn() } as never,
        fetchImpl: async () => new Response(streamFrame('response.output_item.done', 0, { output_index: 0, item: imageItem }) +
          streamFrame('response.output_item.done', 1, { output_index: 1, item: call }) + terminalFrame('completed', [imageItem, call], 2),
          { headers: { 'content-type': 'text/event-stream' } }) }).run(command)
      expect(first.state).toBe('awaiting_tool')
      const next = await createOpenAIResponsesToolContinuationCoordinatorV2({ db, credentialService: streamCredentials(), nowMs: () => 400 }).submit({
        operationId: 'operation:source', branchId: 'b', answerRootId: 'answer:source', expectedHeadMessageId: 'answer:source',
        priorRequestSequence: 1, toolOutputs: [{ toolCallId: 'call', content: 'sunny', userConfirmedExternalSideEffect: false }],
      })
      const body = JSON.parse(next.preparedRequest.body.copyUtf8Text())
      expect(body.input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call', output: 'sunny' })
      expect(body.input).toContainEqual({ role: 'user', content: [
        { type: 'input_text', text: expect.stringContaining('generated by the assistant') },
        { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` },
      ] })
    } finally { db.close() }
  })

  it('materializes a large base64 image without overflowing validation', async () => {
    const db = database(['synthetic'], imageRules)
    try {
      const largeResult = `iVBORw0KGgoA${'AAAA'.repeat(2 * 1024 * 1024)}`
      const persist = vi.fn()
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' } })
      const result = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        attachmentBlobStore: { persist } as never,
        fetchImpl: async () => new Response(terminalFrame('completed', [{ ...imageItem, result: largeResult }], 0),
          { headers: { 'content-type': 'text/event-stream' } }) }).run(command)
      expect(result.state).toBe('completed')
      expect(persist).toHaveBeenCalledTimes(1)
      expect(persist.mock.calls[0][0].length).toBe(Buffer.from(largeResult, 'base64').length)
    } finally { db.close() }
  })

  it.each([1, 2])('materializes %i completed image tools into bytes, assets, branch images and image events', async imageCount => {
    const db = database(['synthetic'], imageRules)
    const bytes = new Uint8Array(Buffer.from(imageBase64, 'base64'))
    const persist = vi.fn()
    const publish = vi.fn()
    const items = Array.from({ length: imageCount }, (_, index) => ({ ...imageItem, id: `ig:${index}` }))
    const fetchImpl = vi.fn(async () => new Response(terminalFrame('completed', items, 0),
      { headers: { 'content-type': 'text/event-stream' } }))
    try {
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' } })
      await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        attachmentBlobStore: { persist } as never, streamProjectionSink: { publish }, fetchImpl }).run(command)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(persist).toHaveBeenCalledTimes(imageCount)
      for (const [persisted] of persist.mock.calls) expect(new Uint8Array(persisted)).toEqual(bytes)
      expect(db.prepare('SELECT count(*) AS n FROM file_blob_v2').get()).toEqual({ n: 1 })
      expect(db.prepare("SELECT count(*) AS n FROM file_asset_v2 WHERE source_kind='generated' AND asset_kind='image'").get())
        .toEqual({ n: imageCount })
      expect(db.prepare('SELECT count(*) AS n FROM asset_revision_v2').get()).toEqual({ n: imageCount })
      expect(db.prepare('SELECT output_index,partial_image_index FROM generation_image_output_v2 ORDER BY output_index').all())
        .toEqual(items.map((_, index) => ({ output_index: index, partial_image_index: index })))
      const answer = new ConversationReadV2Repo(db).readBranch('b').turns[0]!.answers[0]!
      expect(answer).toMatchObject({ status: 'completed', body: '', images: items.map(() => ({
        sha256: createHash('sha256').update(bytes).digest('hex'), mime: 'image/png',
        assetId: expect.any(String), assetRevisionId: expect.any(String), storageRef: expect.any(String),
      })) })
      const imageEvents = publish.mock.calls.map(([event]) => event).filter(event => event.type === 'image_output')
      expect(imageEvents).toHaveLength(imageCount)
      expect(imageEvents).toEqual(answer.images.map((image, outputIndex) => expect.objectContaining({
        type: 'image_output', outputIndex, assetId: image.assetId, assetRevisionId: image.assetRevisionId, mime: image.mime,
      })))
    } finally { db.close() }
  })

  it('preserves a completed terminal before an unknown frame in the same chunk without materializing success', async () => {
    const runFailure = async (splitChunks: boolean) => {
      const db = database(['synthetic'], imageRules)
      const publish = vi.fn()
      const completed = terminalFrame('completed', [imageItem], 0)
      const unknown = streamFrame('response.future_unknown', 1, {})
      const chunks = splitChunks ? [completed, unknown] : [completed + unknown]
      const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/event-stream' } }))
      try {
        const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' } })
        const result = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
          streamProjectionSink: { publish }, fetchImpl }).run(command)
        const snapshot = loadInterruptedSnapshot(db, 'operation:source')
        expect(result.state).toBe('failed')
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(db.prepare('SELECT state FROM generation_operation_v2 WHERE operation_id=?').get('operation:source'))
          .toEqual({ state: 'failed' })
        expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
          .toEqual({ state: 'failed' })
        expect(db.prepare('SELECT count(*) AS n FROM generation_native_completion_receipt_v2 WHERE operation_id=?')
          .get('operation:source')).toEqual({ n: 0 })
        expect(db.prepare('SELECT count(*) AS n FROM generation_image_output_v2').get()).toEqual({ n: 0 })
        expect(db.prepare('SELECT count(*) AS n FROM file_asset_v2 WHERE source_kind=\'generated\'').get()).toEqual({ n: 0 })
        expect(publish.mock.calls.map(([event]) => event.type)).not.toContain('image_output')
        expect(snapshot.native).toMatchObject({ complete: true, terminalFact: {
          terminalKind: 'completed', output: [imageItem],
        } })
        return snapshot.native
      } finally { db.close() }
    }

    const sameChunkSnapshot = await runFailure(false)
    const splitChunkSnapshot = await runFailure(true)
    expect(sameChunkSnapshot).toEqual(splitChunkSnapshot)
  })

  it('recovers a durable pure image completion after asset write failure without another provider fetch', async () => {
    let db = database(['synthetic'], imageRules)
    const persist = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(terminalFrame('completed', [imageItem], 0),
      { headers: { 'content-type': 'text/event-stream' } }))
    const makeRunner = (target: BetterSqlite3.Database) => createOpenAIResponsesStreamRunnerV2({ db: target,
      credentialService: streamCredentials(), nowMs: () => 300, attachmentBlobStore: { persist } as never, fetchImpl })
    const saveSpy = vi.spyOn(AttachmentAssetV2Repo.prototype, 'createGeneratedImageAssetInAuthorityTransaction')
      .mockImplementationOnce(() => { throw new Error('injected generated image asset failure') })
    try {
      const command = await streamFixture(db, false, 'synthetic', { schemaVersion: 2, image: { mode: 'generate' } })
      await expect(makeRunner(db).run(command)).rejects.toMatchObject({
        code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
      })
      saveSpy.mockRestore()
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      for (const table of ['file_blob_v2', 'file_asset_v2', 'asset_revision_v2', 'generation_image_output_v2'])
        expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
      await createGenerationNativeCompletionRecoveryWorkSourceV2(db).quiesce()
      const serialized = db.serialize()
      db.close()
      db = new BetterSqlite3(serialized)
      makeRunner(db)
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400)).toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(0)
      expect(db.prepare('SELECT count(*) AS n FROM generation_image_output_v2').get()).toEqual({ n: 1 })
      expect(new ConversationReadV2Repo(db).readBranch('b').turns[0]!.answers[0]!)
        .toMatchObject({ status: 'completed', body: '', images: [{ mime: 'image/png' }] })
      expect(persist).toHaveBeenCalledTimes(2)
    } finally { saveSpy.mockRestore(); if (db.open) db.close() }
  })

  it.each([undefined, { schemaVersion: 2, image: { mode: 'disabled' } }])(
    'rejects image output on a text operation without image-generation intent (%j)', async config => {
      const db = database(['synthetic'], imageRules)
      try {
        const command = await streamFixture(db, false, 'synthetic', config)
        await expect(createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
          attachmentBlobStore: { persist: vi.fn() } as never,
          fetchImpl: async () => new Response(terminalFrame('completed', [imageItem], 0),
            { headers: { 'content-type': 'text/event-stream' } }),
        }).run(command)).rejects.toMatchObject({
          code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
          cause: { code: 'GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID' },
        })
        for (const table of ['file_blob_v2', 'file_asset_v2', 'asset_revision_v2', 'generation_image_output_v2'])
          expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
      } finally { db.close() }
    },
  )

  async function installReviewedRules(db: BetterSqlite3.Database, modelId: string) {
    const subjects = buildAuthoritativeModelSubjectSetV1(subjectCandidates([modelId]))
    const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects })
    const draft = service.openDraft({ sessionId: 'request-rule-test' })
    const replaced = service.replaceDraft({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision,
      snapshot: { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: createReviewedRequestRulePacksV2().map(value => value.pack) }, notes: [] })
    await service.saveDraft({ sessionId: replaced.sessionId, expectedDraftRevision: replaced.draftRevision })
  }

  it('resolves a real V2 User pack, retains Luna none temperature and persists the policy proof', async () => {
    const modelId = 'gpt-6-luna'
    const db = database([modelId], [])
    try {
      await installReviewedRules(db, modelId)
      const command = await streamFixture(db, false, modelId, { schemaVersion: 2,
        generation: { temperature: 0.4 }, reasoning: { mode: 'disabled' } })
      expect(JSON.parse(command.preparedRequest.body.copyUtf8Text())).toMatchObject({ reasoning: { effort: 'none' }, temperature: 0.4 })
      const row = db.prepare('SELECT canonical_json AS json FROM assistant_generation_snapshot_v2').get() as { json: string }
      const snapshot = JSON.parse(row.json)
      expect(snapshot.requestPlan).toMatchObject({ schemaVersion: 2, resolution: { schemaVersion: 2 } })
      expect(snapshot.requestPlan.resolution.decisions).toContainEqual(expect.objectContaining({ outcome: 'validated',
        decisionKey: expect.stringContaining('temperature-validation') }))
      const temperature = snapshot.requestPlan.resolution.capabilityFields.find((field: { path: string }) => field.path === 'generation.temperature')
      expect(temperature.evidenceIds.some((id: string) => id.startsWith('request-rule.'))).toBe(true)
      expect(snapshot.requestPlan.resolution.capabilityEvidence).toContainEqual(expect.objectContaining({
        evidenceId: expect.stringMatching(/^request-rule\./), kind: 'capability_rule', effect: 'supports',
        sourceRef: expect.stringContaining('temperature-true'),
      }))
    } finally { db.close() }
  })

  it('rejects non-none temperature before operation commit or provider dispatch and retains submitted settings', async () => {
    const modelId = 'gpt-6-luna'
    const db = database([modelId], [])
    try {
      await installReviewedRules(db, modelId)
      await expect(streamFixture(db, false, modelId, { schemaVersion: 2,
        generation: { temperature: 0.4 }, reasoning: { mode: 'enabled', effort: 'low' } }))
        .rejects.toThrow('GENERATION_V2_RULE_TEMPERATURE_REQUIRES_NONE')
      const fetchImpl = vi.fn(async () => new Response(''))
      const runtime = createOpenAIResponsesGenerationV2Runtime({ db, credentialService: streamCredentials(), fetchImpl: fetchImpl as typeof fetch })
      await expect(runtime.submitInitial({ operationId: 'operation:blocked', branchId: 'b', expectedHeadMessageId: null,
        userBody: 'Still blocked', modelId, commandAttachments: [] })).rejects.toThrow('GENERATION_V2_RULE_TEMPERATURE_REQUIRES_NONE')
      expect(fetchImpl).not.toHaveBeenCalled()
      for (const table of ['generation_operation_v2', 'generation_request_v2', 'assistant_generation_snapshot_v2', 'message_v2'])
        expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='b'").get()).toEqual({ head_message_id: null })
      expect(new GenerationConfigV2Repo(db).getScope('conversation', 'c').semanticLayer.generation?.temperature).toBe(0.4)
    } finally { db.close() }
  })
  it('uses the new mechanical pipeline for a fresh profile without installed Rule owners', async () => {
    const modelId = 'gpt-6-luna'
    const db = database([modelId], [])
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      for (const owner of core.listOwnershipSnapshots()) core.deleteOwnershipSnapshot({
        ownership: owner.projected.definition.ownership, ownerId: owner.projected.definition.ownerId,
        expectedSnapshotRevision: owner.projected.snapshotRevision })
      const command = await streamFixture(db, false, modelId, { schemaVersion: 2,
        generation: { temperature: 0.4 }, reasoning: { mode: 'disabled', effort: 'none' } })
      expect(JSON.parse(command.preparedRequest.body.copyUtf8Text()).temperature).toBe(0.4)
      const snapshot = JSON.parse((db.prepare('SELECT canonical_json FROM assistant_generation_snapshot_v2').get() as { canonical_json: string }).canonical_json)
      expect(snapshot.requestPlan.schemaVersion).toBe(2)
      expect(snapshot.requestPlan.resolution.ownerSnapshotRevisions).toEqual([])
      expect(snapshot.requestPlan.resolution.decisions).toEqual([])
    } finally { db.close() }
  })

  it('carries explicit user off through compatibility, plan, snapshot, and the current prepared compiler', async () => {
    const modelId = 'gpt-6-luna'
    const rules = [
      exactRule({ ruleId: `${modelId}.reasoning.support`, nativeModelId: modelId,
        path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }),
      exactRule({ ruleId: `${modelId}.reasoning.required`, nativeModelId: modelId,
        path: 'reasoning.required', value: { kind: 'boolean', value: false } }),
      exactRule({ ruleId: `${modelId}.reasoning.modes`, nativeModelId: modelId,
        path: 'reasoning.modes.nativeValues', value: { kind: 'native_string_set', values: ['enabled', 'disabled'], completeness: 'complete' } }),
      exactRule({ ruleId: `${modelId}.reasoning.efforts`, nativeModelId: modelId,
        path: 'reasoning.effort.nativeValues', value: { kind: 'native_string_set', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], completeness: 'complete' } }),
      exactRule({ ruleId: `${modelId}.reasoning.default`, nativeModelId: modelId,
        path: 'reasoning.effort.providerDefault', value: { kind: 'native_string', value: 'medium' } }),
      exactRule({ ruleId: `${modelId}.sampling.temperature.support`, nativeModelId: modelId,
        path: 'sampling.temperature.support', value: { kind: 'support', value: 'supported' } }),
    ]
    const db = database([modelId], rules)
    try {
      const command = await streamFixture(db, false, modelId, { schemaVersion: 2,
        generation: { temperature: 0.4, topP: 0.8 }, reasoning: { mode: 'disabled', effort: 'high' } })
      expect(JSON.parse(command.preparedRequest.body.copyUtf8Text())).toMatchObject({
        reasoning: { effort: 'none' }, temperature: 0.4, top_p: 0.8,
      })
      const storedSnapshot = db.prepare('SELECT canonical_json AS json FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
        .get(command.preparedRequest.answerRootId) as { json: string } | undefined
      expect(storedSnapshot).toBeDefined()
      const snapshot = JSON.parse(storedSnapshot!.json)
      expect(snapshot.semanticIntent.reasoning).toMatchObject({ mode: 'disabled', effort: 'none' })
      expect(snapshot.requestPlan).toBeDefined()
      expect(command.preparedRequest.ledger.entries).toContainEqual(expect.objectContaining({
        path: 'reasoning.effort', disposition: 'encoded', nativeField: 'reasoning.effort',
      }))
    } finally { db.close() }
  })

  it('replays a durable provider-complete receipt after local native save failure without fetching again', async () => {
    let db = database(['synthetic'], [])
    let fetchCount = 0
    try {
      const command = await streamFixture(db)
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_item.done', 2, { output_index: 1, item: streamMessage }) +
        terminalFrame('completed', [{ ...streamReasoning, encrypted_content: 'durable-completion' }, streamMessage], 3)
      const makeRunner = (target: BetterSqlite3.Database, streamProjectionSink?: { publish: () => void }) =>
        createOpenAIResponsesStreamRunnerV2({ db: target, credentialService: streamCredentials(), nowMs: () => 300,
          streamProjectionSink, fetchImpl: async () => {
            fetchCount += 1
            return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
          } })
      const runtimeRegistry = new GenerationOperationRuntimeRegistryV2(db, () => 350)
      const insertSpy = vi.spyOn(OpenAIResponsesArtifactsV2Repo.prototype, 'insertOperationTerminal')
        .mockImplementationOnce(() => { throw new Error('injected native artifact write failure') })
      let completionError: unknown
      expect(runtimeRegistry.start(command, async (signal) => {
        try { return await makeRunner(db).run(command, signal) } catch (error) { completionError = error; throw error }
      })).toBe(true)
      expect(runtimeRegistry.countActive()).toBe(1)
      await vi.waitFor(() => expect(runtimeRegistry.countActive()).toBe(0))
      insertSpy.mockRestore()
      expect(completionError).toMatchObject({ code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })
      expect(db.prepare('SELECT outcome_json AS outcomeJson FROM generation_attempt_v2').get())
        .toEqual({ outcomeJson: null })

      await createGenerationNativeCompletionRecoveryWorkSourceV2(db).quiesce()
      const image = db.serialize()
      db.close()
      db = new BetterSqlite3(image)
      makeRunner(db) // Register the protocol materializer before recovery.
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400)).toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchCount).toBe(1)
      expect(db.prepare('SELECT materialization_state AS state FROM generation_native_completion_receipt_v2').get())
        .toEqual({ state: 'materialized' })
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'completed' })
      expect(db.prepare('SELECT count(*) AS count FROM generation_native_artifact_v2').get()).toEqual({ count: 2 })
    } finally { if (db.open) db.close() }
  })

  it('retries local receipt materialization without keeping provider work active or fetching again', async () => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db)
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_item.done', 2, { output_index: 1, item: streamMessage }) +
        terminalFrame('completed', [{ ...streamReasoning, encrypted_content: 'scheduled-retry' }, streamMessage], 3)
      let fetchCount = 0
      const runner = createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => {
          fetchCount += 1
          return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
        } })
      const runtimeRegistry = new GenerationOperationRuntimeRegistryV2(db, () => 350)
      const insertSpy = vi.spyOn(OpenAIResponsesArtifactsV2Repo.prototype, 'insertOperationTerminal')
        .mockImplementationOnce(() => { throw new Error('injected one-shot native artifact failure') })
      let completionError: unknown
      expect(runtimeRegistry.start(command, async (signal) => {
        try { return await runner.run(command, signal) } catch (error) { completionError = error; throw error }
      })).toBe(true)
      await vi.waitFor(() => expect(runtimeRegistry.countActive()).toBe(0))
      insertSpy.mockRestore()
      expect(completionError).toMatchObject({ code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true })
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })
      expect(db.prepare('SELECT outcome_json AS outcomeJson FROM generation_attempt_v2').get())
        .toEqual({ outcomeJson: null })

      await vi.waitFor(() => expect(db.prepare(`SELECT materialization_state AS state
        FROM generation_native_completion_receipt_v2`).get()).toEqual({ state: 'materialized' }), { timeout: 5_000 })
      expect(fetchCount).toBe(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'completed' })
      expect(db.prepare('SELECT outcome_json AS outcomeJson FROM generation_attempt_v2').get())
        .toMatchObject({ outcomeJson: expect.stringContaining('provider_completed') })
      expect(runtimeRegistry.getSnapshot('operation:source')?.status).toBe('completed')
    } finally { db.close() }
  })

  it('treats a post-commit projection sink exception as non-fatal to provider completion', async () => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db)
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_item.done', 2, { output_index: 1, item: streamMessage }) +
        terminalFrame('completed', [{ ...streamReasoning, encrypted_content: 'sink-completion' }, streamMessage], 3)
      const runtimeRegistry = new GenerationOperationRuntimeRegistryV2(db, () => 350)
      const runner = createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        streamProjectionSink: { publish: () => { throw new Error('injected sink failure') } },
        fetchImpl: async () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }) })
      expect(runtimeRegistry.start(command, (signal) => runner.run(command, signal))).toBe(true)
      await vi.waitFor(() => expect(runtimeRegistry.countActive()).toBe(0))
      expect(db.prepare('SELECT state FROM generation_attempt_v2').get()).toEqual({ state: 'terminal' })
      expect(db.prepare('SELECT materialization_state AS state FROM generation_native_completion_receipt_v2').get())
        .toEqual({ state: 'materialized' })
      const persistedBody = (db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(command.preparedRequest.answerRootId) as { body: string }).body
      const snapshot = runtimeRegistry.getSnapshot(command.preparedRequest.operationId)
      expect(snapshot).toMatchObject({ status: 'completed', body: persistedBody })
      expect(runtimeRegistry.listSnapshots()).toContainEqual(snapshot)
    } finally { db.close() }
  })

  it.each([false, true])('persists A and B independently and replays A after reopen (tool continuation=%s)', async tools => {
    let db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db, tools)
      const last = tools ? { id: 'fc', type: 'function_call', call_id: 'call', name: 'weather', arguments: '{}', status: 'completed' } : streamMessage
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_item.done', 2, { output_index: 1, item: last }) +
        terminalFrame('completed', [{ ...streamReasoning, encrypted_content: 'terminal-B' }, last], 3)
      const result = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }) }).run(command)
      expect(result.state).toBe(tools ? 'awaiting_tool' : 'completed')
      const { rows: artifacts, raw: rawArtifacts } = nativeArtifactRows(db)
      expect(artifacts).toHaveLength(2)
      const serialized = JSON.stringify(rawArtifacts)
      expect(serialized).toContain('done-A')
      expect(serialized).toContain('terminal-B')
      const continuation = rawArtifacts.find(row => row.artifactKind === 'openai_responses_ordered_native_items_v2')!
      const rawTerminal = rawArtifacts.find(row => row.artifactKind !== 'openai_responses_ordered_native_items_v2')!
      expect(continuation.rawJson).toContain('done-A')
      expect(continuation.rawJson).not.toContain('terminal-B')
      expect(rawTerminal.rawJson).toContain('terminal-B')
      expect(rawTerminal.rawJson).not.toContain('done-A')
      const image = db.serialize()
      db.close()
      db = new BetterSqlite3(image)
      expect(nativeArtifactRows(db).rows).toEqual(artifacts)
      const next = tools
        ? await createOpenAIResponsesToolContinuationCoordinatorV2({ db, credentialService: streamCredentials(), nowMs: () => 400 }).submit({
          operationId: 'operation:source', branchId: 'b', answerRootId: 'answer:source', expectedHeadMessageId: 'answer:source',
          priorRequestSequence: 1, toolOutputs: [{ toolCallId: 'call', content: 'sunny', userConfirmedExternalSideEffect: false }],
        })
        : await createOpenAIResponsesPlainTextInitialSendCoordinatorV2({ db, credentialService: streamCredentials(), nowMs: () => 400,
          createGraphId: kind => `${kind}:next` }).submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
          command: { operationId: 'operation:next', branchId: 'b', expectedHeadMessageId: 'answer:source', userBody: 'Next', modelId: 'synthetic', commandAttachments: [] } })
      const body = next.preparedRequest.body.copyUtf8Text()
      expect(body).toContain('done-A')
      expect(body).not.toContain('terminal-B')
      if (tools) expect(body).toContain('function_call_output')
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { if (db.open) db.close() }
  })

  it.each([
    { label: 'different ciphertext', terminalCipher: 'terminal-B' as string | null | undefined },
    { label: 'absent ciphertext', terminalCipher: undefined as string | null | undefined },
    { label: 'null ciphertext', terminalCipher: null as string | null | undefined },
    { label: 'empty ciphertext', terminalCipher: '' as string | null | undefined },
  ])('recovers the frozen done-A replay with $label without fetching again', async ({ terminalCipher }) => {
    const db = database(['synthetic'], [])
    let fetchCount = 0
    const recoveryWork = createGenerationNativeCompletionRecoveryWorkSourceV2(db)
    try {
      const command = await streamFixture(db)
      const doneReasoning = { id: 'rs', type: 'reasoning', summary: [], encrypted_content: 'done-A' }
      const terminalReasoning = { id: 'rs', type: 'reasoning', summary: [],
        ...(terminalCipher === undefined ? {} : { encrypted_content: terminalCipher }) }
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: doneReasoning }) +
        streamFrame('response.output_item.done', 2, { output_index: 1, item: streamMessage }) +
        terminalFrame('completed', [terminalReasoning, streamMessage], 3)
      const runner = createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => {
          fetchCount += 1
          return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
        } })
      const artifactSpy = vi.spyOn(OpenAIResponsesArtifactsV2Repo.prototype, 'insertOperationTerminal')
        .mockImplementationOnce(() => { throw new Error('injected operation artifact failure') })
      let completionError: unknown
      try { await runner.run(command) } catch (error) { completionError = error }
      artifactSpy.mockRestore()
      await recoveryWork.quiesce()

      expect(completionError).toMatchObject({ code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400))
        .toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchCount).toBe(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'completed' })
      expect(db.prepare('SELECT materialization_state AS state FROM generation_native_completion_receipt_v2').get())
        .toEqual({ state: 'materialized' })
      const { raw } = nativeArtifactRows(db)
      const continuation = raw.find(row => row.artifactKind === 'openai_responses_ordered_native_items_v2')!
      const terminal = raw.find(row => row.artifactKind !== 'openai_responses_ordered_native_items_v2')!
      expect(continuation.rawJson).toContain('done-A')
      expect(terminal.rawJson).not.toContain('done-A')
      if (terminalCipher === undefined) expect(terminal.rawJson).not.toContain('encrypted_content')
      else expect(terminal.rawJson).toContain(`"encrypted_content":${JSON.stringify(terminalCipher)}`)
      if (terminalCipher === 'terminal-B') expect(continuation.rawJson).not.toContain('terminal-B')
    } finally { db.close() }
  })

  it.each(['failed', 'incomplete'] as const)('preserves raw B for %s without inserting a successful artifact', async status => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db)
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_text.delta', 2, { delta: 'answer' }) +
        streamFrame('response.output_item.done', 3, { output_index: 1, item: streamMessage }) +
        terminalFrame(status, [{ ...streamReasoning, encrypted_content: 'terminal-B' }, streamMessage])
      const result = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }) }).run(command)
      expect(result.state).toBe('failed')
      const snapshot = loadInterruptedSnapshot(db, 'operation:source')
      expect(snapshot.native.complete).toBe(false)
      expect(snapshot.native.terminalFact).toMatchObject({ terminalKind: status, output: [
        { ...streamReasoning, encrypted_content: 'terminal-B' }, streamMessage,
      ] })
      const replay = loadInterruptedReplay(db, command.preparedRequest.answerRootId)
      expect(JSON.stringify(replay)).toContain('done-A')
      expect(JSON.stringify(replay)).not.toContain('terminal-B')
      expect(db.prepare('SELECT count(*) AS n FROM generation_native_artifact_v2').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })

  it.each(['failed', 'incomplete'] as const)('recovers a valid %s terminal from its receipt without fetching again', async status => {
    const db = database(['synthetic'], [])
    let fetchCount = 0
    const recoveryWork = createGenerationNativeCompletionRecoveryWorkSourceV2(db)
    try {
      const command = await streamFixture(db)
      const sse = streamFrame('response.output_item.done', 1, { output_index: 0, item: streamReasoning }) +
        streamFrame('response.output_text.delta', 2, { delta: 'answer' }) +
        streamFrame('response.output_item.done', 3, { output_index: 1, item: streamMessage }) +
        terminalFrame(status, [{ ...streamReasoning, encrypted_content: 'incomplete-terminal-ciphertext' }, streamMessage])
      const runner = createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => {
          fetchCount += 1
          return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
        } })
      const checkpointSpy = vi.spyOn(GenerationInterruptedReplayV2Repo.prototype, 'insert')
        .mockImplementationOnce(() => {
          expect(db.prepare('SELECT count(*) AS n FROM generation_native_completion_receipt_v2').get())
            .toEqual({ n: 1 })
          throw new Error('injected incomplete checkpoint failure')
        })
      let completionError: unknown
      try { await runner.run(command) } catch (error) { completionError = error }
      checkpointSpy.mockRestore()
      await recoveryWork.quiesce()
      expect(completionError).toMatchObject({ code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })

      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400))
        .toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchCount).toBe(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'failed' })
      expect(db.prepare(`SELECT outcome_json AS outcomeJson FROM generation_attempt_v2`).get())
        .toMatchObject({ outcomeJson: expect.stringContaining('provider_failed') })
      expect(db.prepare('SELECT materialization_state AS state FROM generation_native_completion_receipt_v2').get())
        .toEqual({ state: 'materialized' })
      expect(db.prepare('SELECT count(*) AS n FROM generation_native_artifact_v2').get()).toEqual({ n: 0 })
      const snapshotRow = db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get() as { json: string }
      const snapshot = JSON.parse(snapshotRow.json)
      expect(snapshot.native).toMatchObject({ complete: false,
        terminalFact: status === 'incomplete'
          ? { terminalKind: 'incomplete', incompleteReason: 'max_output_tokens' }
          : { terminalKind: 'failed', error: { code: 'server_error', message: 'provider failed' } } })
      expect(snapshot.native.items[0].encrypted_content).toBe('done-A')
      expect(JSON.stringify(snapshot.native.terminalFact.output)).toContain('incomplete-terminal-ciphertext')
      expect(JSON.stringify(snapshot.native.terminalFact.output)).toContain('answer')
      expect(db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(command.preparedRequest.answerRootId)).toEqual({ body: 'answer' })
    } finally { if (db.open) db.close() }
  })

  it('recovers a 21 MiB incomplete terminal body from its receipt without truncation or refetch', async () => {
    let db = database(['synthetic'], [])
    const visibleText = 'x'.repeat(21 * 1024 * 1024)
    let fetchCount = 0
    try {
      const command = await streamFixture(db)
      const message = { ...streamMessage, status: 'incomplete',
        content: [{ type: 'output_text', text: visibleText, annotations: [] }] }
      const sse = terminalFrame('incomplete', [message], 0)
      const graphWriteSpy = vi.spyOn(ConversationGraphV2Repo.prototype, 'compareAndSetStreamingAssistantBody')
        .mockImplementationOnce(() => { throw new Error('injected pre-write checkpoint failure') })
      let completionError: unknown
      try {
        await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
          fetchImpl: async () => {
            fetchCount += 1
            return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
          } }).run(command)
      } catch (error) { completionError = error } finally { graphWriteSpy.mockRestore() }

      expect(completionError).toMatchObject({
        code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
      })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })
      expect(db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(command.preparedRequest.answerRootId)).toEqual({ body: '' })

      const image = db.serialize()
      db.close()
      db = new BetterSqlite3(image)
      createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 400,
        fetchImpl: async () => { throw new Error('RECOVERY_MUST_NOT_FETCH') } })
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400))
        .toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchCount).toBe(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'failed' })
      expect(db.prepare('SELECT state FROM generation_operation_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'failed' })
      expect(db.prepare('SELECT materialization_state AS state FROM generation_native_completion_receipt_v2').get())
        .toEqual({ state: 'materialized' })
      const body = db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(command.preparedRequest.answerRootId) as { body: string }
      expect(Buffer.byteLength(body.body, 'utf8')).toBe(21 * 1024 * 1024)
      expect(createHash('sha256').update(body.body, 'utf8').digest('hex'))
        .toBe(createHash('sha256').update(visibleText, 'utf8').digest('hex'))
      const snapshot = loadInterruptedSnapshot(db, 'operation:source')
      expect(snapshot.native.terminalFact.terminalKind).toBe('incomplete')
      expect(snapshot.native.terminalFact.output[0].content[0].text).toBe(visibleText)
    } finally { if (db.open) db.close() }
  }, 30_000)

  it.each([false, true])('preserves cancellation without promoting reasoning before done (done=%s)', async done => {
    const db = database(['synthetic'], [])
    try {
      const command = await streamFixture(db)
      const controller = new AbortController()
      const sse = streamFrame(`response.output_item.${done ? 'done' : 'added'}`, 1, { output_index: 0,
        item: done ? streamReasoning : { ...streamReasoning, encrypted_content: 'truncated', status: 'in_progress' } }) +
        streamFrame('response.output_text.delta', 2, { delta: 'partial' })
      const result = await createOpenAIResponsesStreamRunnerV2({ db, credentialService: streamCredentials(), nowMs: () => 300,
        fetchImpl: async () => new Response(new ReadableStream({ start(stream) {
          stream.enqueue(new TextEncoder().encode(sse))
          setTimeout(() => controller.abort(new Error('user stopped')), 10)
        } }), { headers: { 'content-type': 'text/event-stream' } }) }).run(command, controller.signal)
      expect(result.state).toBe('cancelled')
      const snapshot = loadInterruptedSnapshot(db, 'operation:source')
      expect(snapshot.native.complete).toBe(false)
      const replay = loadInterruptedReplay(db, command.preparedRequest.answerRootId)
      expect(JSON.stringify(replay)).not.toContain('truncated')
      expect(JSON.stringify(replay).includes('done-A')).toBe(done)
      expect(db.prepare('SELECT count(*) AS n FROM generation_native_artifact_v2').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })
})

describe('OpenAI Responses Goal 3 capability resolution', () => {
  it.each(['regenerate_question', 'edit_resend'] as const)('commits %s with its actual source answer and preserves the source branch', async actionKind => {
    const db = database(['synthetic'], [])
    try {
      const credentials = credentialService()
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const graph = new ConversationGraphV2Repo(db)
        graph.createProject(context, { projectId: 'p', name: 'Synthetic', createdAtMs: 1 })
        graph.createConversationAndDefaultBranch(context, { projectId: 'p', conversationId: 'c', branchId: 'b', title: 'Synthetic', branchName: null, createdAtMs: 2 })
      })
      await createOpenAIResponsesPlainTextInitialSendCoordinatorV2({ db, credentialService: credentials, nowMs: () => 200,
        createGraphId: kind => `${kind}:source` }).submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        command: { operationId: 'operation:source', branchId: 'b', expectedHeadMessageId: null, userBody: 'Original', modelId: 'synthetic', commandAttachments: [] } })
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, 'operation:source')!
        const requests = new GenerationRequestV2Repo(db)
        requests.terminalize(context, requests.loadExistingForOperation(context, execution, 1), 'cancelled', 220)
        new ConversationGraphV2Repo(db).terminalizeAssistantMessage(context, 'answer:source', 'cancelled', null, 220)
        new GenerationExecutionV2Repo(db).terminalizeOperation(context, execution, { state: 'cancelled', errorCode: 'user_cancelled', errorMessage: 'cancelled' }, 220)
      })
      const common = { operationId: 'operation:next', clientActionId: 'operation:next', sourceBranchId: 'b',
        expectedHeadMessageId: 'answer:source', modelId: 'synthetic', commandAttachments: [] }
      const result = actionKind === 'regenerate_question'
        ? await createOpenAIResponsesPlainTextRegenerateCoordinatorV2({ db, credentialService: credentials, nowMs: () => 300, createAnswerId: () => 'answer:next' })
          .submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, command: { ...common, questionId: 'question:source', sourceAnswerId: 'answer:source' } })
        : await createOpenAIResponsesPlainTextEditResendCoordinatorV2({ db, credentialService: credentials, nowMs: () => 300,
          createQuestionId: () => 'question:next', createAnswerId: () => 'answer:next' })
          .submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, command: { ...common, sourceQuestionId: 'question:source', sourceAnswerRootId: 'answer:source', userBody: 'Edited' } })
      expect(result.execution.operation.sourceAnswerId?.value).toBe('answer:source')
      expect(result.execution.operation.actionKind).toBe(actionKind)
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='b'").get()).toEqual({ head: 'answer:source' })
      expect(db.prepare("SELECT count(*) AS n FROM generation_operation_v2").get()).toEqual({ n: 2 })
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('consumes exact materialized effort claims without projecting the generic API enum', async () => {
    const models = ['gpt-5', 'gpt-5-pro', 'gpt-5.4-pro-2026-03-05', 'gpt-5.6-sol', 'gpt-5.6-sol-preview']
    const rules = [
      ['gpt-5', ['high', 'low', 'medium', 'minimal'], 'medium'],
      ['gpt-5-pro', ['high'], 'high'],
      ['gpt-5.4-pro-2026-03-05', ['high', 'medium', 'xhigh'], 'medium'],
      ['gpt-5.6-sol', ['high', 'low', 'max', 'medium', 'none', 'xhigh'], 'medium'],
    ].flatMap(([nativeModelId, values, defaultValue]) => [
      exactRule({ ruleId: `${nativeModelId}.effort.values`, nativeModelId: nativeModelId as string,
        path: 'reasoning.effort.nativeValues', value: { kind: 'native_string_set', values: values as string[], completeness: 'complete' } }),
      exactRule({ ruleId: `${nativeModelId}.effort.default`, nativeModelId: nativeModelId as string,
        path: 'reasoning.effort.providerDefault', value: { kind: 'native_string', value: defaultValue as string } }),
      exactRule({ ruleId: `${nativeModelId}.reasoning.support`, nativeModelId: nativeModelId as string,
        path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }),
    ])
    const db = database(models, rules)
    try {
      const service = createGenerationV2CapabilityResolutionService({ db,
        credentialService: credentialService(), openAICompatibleCredentialService: {} as never })
      const resolve = async (nativeModelId: string) => (await service.resolve(request(nativeModelId) as never))
        .resolvedCapability.modelFacts
      expect((await resolve('gpt-5')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'medium', 'minimal'] }, defaultValue: 'medium',
      })
      expect((await resolve('gpt-5-pro')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high'] }, defaultValue: 'high',
      })
      expect((await resolve('gpt-5.4-pro-2026-03-05')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'medium', 'xhigh'] }, defaultValue: 'medium',
      })
      expect((await resolve('gpt-5.6-sol')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'max', 'medium', 'none', 'xhigh'] },
      })
      expect((await resolve('gpt-5.6-sol')).fields.find((field) => field.path === 'image.size')?.state).toBe('unknown')
      expect((await resolve('gpt-5.6-sol-preview')).fields.find((field) => field.path === 'reasoning.effort')?.state)
        .toBe('unknown')
    } finally { db.close() }
  })

  it('consumes exact o-series support claims while leaving undocumented effort unknown', async () => {
    const models = ['o1', 'o1-2024-12-17', 'o3', 'o3-pro', 'o4-mini-2025-04-16']
    const rules = models.map((nativeModelId) => exactRule({ ruleId: `${nativeModelId}.reasoning.support`, nativeModelId,
      path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }))
    const db = database(models, rules)
    try {
      const service = createGenerationV2CapabilityResolutionService({ db,
        credentialService: credentialService(), openAICompatibleCredentialService: {} as never })
      for (const nativeModelId of models) {
        const resolved = (await service.resolve(request(nativeModelId) as never)).resolvedCapability.modelFacts
        const reasoningMode = resolved.fields.find((field) => field.path === 'reasoning.mode')
        expect(reasoningMode).toMatchObject({ state: 'supported' })
        expect(reasoningMode?.domain).toBeUndefined()
        expect(resolved.fields.find((field) => field.path === 'reasoning.effort')?.state).toBe('unknown')
      }
    } finally { db.close() }
  })
})
