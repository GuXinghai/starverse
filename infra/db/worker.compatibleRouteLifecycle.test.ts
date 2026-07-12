import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createCompatibleRouteCoordinator } from '../../electron/services/compatibleRouteCoordinator'
import { createCompatibleChatRuntimeService } from '../../electron/services/compatibleChatRuntimeService'
import { createCompatibleRequestRegistry } from '../../electron/net/compatibleRequestRegistry'
import { DbWorkerRuntime } from './worker'

function providerBundle(suffix: string, authenticated = false) {
  const providerInstanceId = `ocp_provider_${suffix}`
  const requestProfileId = `ocp_request_profile_${suffix}`
  const reasoningMappingId = `ocp_reasoning_mapping_${suffix}`
  const inlinePolicyId = `ocp_inline_policy_${suffix}`
  const responseProfileId = `ocp_response_profile_${suffix}`
  const credentialVersionRef = authenticated ? `ocp_credential_${suffix}` : null
  return {
    provider: { providerInstanceId, displayName: `Provider ${suffix}`, createdAtMs: 1 },
    credential: authenticated ? {
      credentialVersionRef,
      providerInstanceId,
      version: 1,
      authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: {
        schemaVersion: 1,
        authMode: 'bearer',
        configured: true,
        maskState: 'configured_masked',
        sensitiveHeaderNames: [],
      },
      createdAtMs: 1,
    } : null,
    requestProfile: {
      requestProfileId,
      version: 1,
      config: {
        schemaVersion: 1,
        standardFieldOwnership: 'builder',
        unsupportedFieldPolicy: 'error_before_fetch',
        extraBody: { enabled: true, maxDepth: 8, maxKeys: 256, maxBytes: 65536 },
      },
      createdAtMs: 1,
    },
    reasoningMapping: {
      mappingId: reasoningMappingId,
      version: 1,
      config: { schemaVersion: 1, mode: 'custom_preferred_with_builtin_fallback', rules: [], replay: { format: 'disabled', scope: 'never' } },
      createdAtMs: 1,
    },
    inlinePolicy: {
      inlinePolicyId,
      version: 1,
      config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] },
      createdAtMs: 1,
    },
    responseProfile: {
      responseProfileId,
      version: 1,
      reasoningMappingId,
      reasoningMappingVersion: 1,
      inlinePolicyId,
      inlinePolicyVersion: 1,
      config: {
        schemaVersion: 1,
        choicePolicy: 'preserve_all',
        unknownFieldPolicy: 'bounded_diagnostics',
        reasoningMapping: { mappingId: reasoningMappingId, version: 1 },
        inlinePolicy: { inlinePolicyId, version: 1 },
      },
      createdAtMs: 1,
    },
    endpoint: {
      endpointRevisionId: `ocp_endpoint_${suffix}`,
      providerInstanceId,
      revision: 1,
      baseUrl: 'https://api.example.test/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      auth: credentialVersionRef ? { mode: 'bearer', credentialVersionRef } : { mode: 'none' },
      credentialVersionRef,
      ordinaryHeaders: [],
      sensitiveHeaderRefs: [],
      query: [],
      requestProfileId,
      requestProfileVersion: 1,
      responseProfileId,
      responseProfileVersion: 1,
      createdAtMs: 1,
    },
  }
}

async function call(runtime: DbWorkerRuntime, method: string, params?: unknown) {
  const response = await runtime.handleMessage({ id: `${method}-${Math.random()}`, method: method as any, params })
  if (!response.ok) throw Object.assign(new Error(response.error?.message ?? 'worker failure'), { code: response.error?.code })
  return response.result as any
}

async function setup(runtime: DbWorkerRuntime, suffix = '12345678', authenticated = false) {
  const bundle = providerBundle(suffix, authenticated)
  await call(runtime, 'compatibleRegistry.create', bundle)
  const convo = await call(runtime, 'convo.create', { title: 'Compatible route test' })
  const branch = await call(runtime, 'branch.ensureDefault', { convoId: convo.id, name: 'Main' })
  return { bundle, convoId: convo.id as string, branchId: branch.id as string }
}

function routeInput(suffix: string, bundle: ReturnType<typeof providerBundle>, modelId = 'model-a', createdAtMs = 10) {
  return {
    route: {
      routeProvenanceId: `ocp_route_${suffix}`,
      requestId: `request-${suffix}`,
      providerInstanceId: bundle.provider.providerInstanceId,
      modelId,
      createdAtMs,
    },
    pinSource: { kind: 'selected', pins: {
      providerInstanceId: bundle.provider.providerInstanceId, modelId,
      endpointRevisionId: bundle.endpoint.endpointRevisionId, credentialVersionRef: bundle.endpoint.credentialVersionRef,
      requestProfileId: bundle.requestProfile.requestProfileId, requestProfileVersion: bundle.requestProfile.version,
      responseProfileId: bundle.responseProfile.responseProfileId, responseProfileVersion: bundle.responseProfile.version,
      reasoningMappingId: bundle.reasoningMapping.mappingId, reasoningMappingVersion: bundle.reasoningMapping.version,
      inlinePolicyId: bundle.inlinePolicy.inlinePolicyId, inlinePolicyVersion: bundle.inlinePolicy.version,
    } },
    turn: { branchId: '', userBody: `question-${suffix}` },
  }
}

function selectedPins(bundle: ReturnType<typeof providerBundle>, modelId = 'model-a') {
  return {
    providerInstanceId: bundle.provider.providerInstanceId, modelId,
    endpointRevisionId: bundle.endpoint.endpointRevisionId, credentialVersionRef: bundle.endpoint.credentialVersionRef,
    requestProfileId: bundle.requestProfile.requestProfileId, requestProfileVersion: bundle.requestProfile.version,
    responseProfileId: bundle.responseProfile.responseProfileId, responseProfileVersion: bundle.responseProfile.version,
    reasoningMappingId: bundle.reasoningMapping.mappingId, reasoningMappingVersion: bundle.reasoningMapping.version,
    inlinePolicyId: bundle.inlinePolicy.inlinePolicyId, inlinePolicyVersion: bundle.inlinePolicy.version,
  }
}

describe('compatible route lifecycle worker contract', () => {
  it('atomically prepares messages, choice zero, branch head and immutable provenance', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, '12345678', true)
      const input = routeInput('12345678', bundle)
      input.turn.branchId = branchId
      const prepared = await call(runtime, 'compatibleRoute.prepareTurn', input)

      expect(prepared.route).toMatchObject({ state: 'prepared', endpointRevisionId: bundle.endpoint.endpointRevisionId, modelId: 'model-a' })
      expect(prepared.choice).toMatchObject({ choiceIndex: 0, messageId: prepared.assistantId })
      expect(prepared.availability).toEqual({ available: true, code: 'ready' })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_route_provenance`).get()).toEqual({ count: 1 })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_route_choices`).get()).toEqual({ count: 1 })
      expect(runtime.db.prepare(`SELECT head_message_id AS id FROM branch WHERE id = ?`).get(branchId)).toEqual({ id: prepared.assistantId })

      const context = await call(runtime, 'context.getRenderableTurns', { branchId })
      expect(context.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: prepared.questionId, routeProvenanceId: prepared.route.routeProvenanceId, choiceIndex: null }),
        expect.objectContaining({ id: prepared.assistantId, routeProvenanceId: prepared.route.routeProvenanceId, choiceIndex: 0 }),
      ]))
      const persisted = await call(runtime, 'message.list', { convoId: prepared.convoId })
      expect(persisted).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: prepared.questionId, routeProvenanceId: prepared.route.routeProvenanceId }),
        expect.objectContaining({ id: prepared.assistantId, routeProvenanceId: prepared.route.routeProvenanceId, choiceIndex: 0 }),
      ]))

      const beforeMessages = runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()
      const beforeHead = runtime.db.prepare(`SELECT head_message_id AS id FROM branch WHERE id = ?`).get(branchId)
      await expect(call(runtime, 'compatibleRoute.prepareTurn', { ...input, turn: { branchId, userBody: 'must roll back' } })).rejects.toThrow()
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()).toEqual(beforeMessages)
      expect(runtime.db.prepare(`SELECT head_message_id AS id FROM branch WHERE id = ?`).get(branchId)).toEqual(beforeHead)
    } finally {
      runtime.shutdown()
    }
  })

  it('atomically prepares every declared choice before streaming and is idempotent', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, 'choices12', true)
      const input = routeInput('choices12', bundle)
      input.turn.branchId = branchId
      const prepared = await call(runtime, 'compatibleRoute.prepareTurn', input)
      const choices = await call(runtime, 'compatibleRoute.prepareChoices', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        choiceCount: 3,
        createdAtMs: 11,
      })
      expect(choices.map((choice: { choiceIndex: number }) => choice.choiceIndex)).toEqual([0, 1, 2])
      const messageCount = runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()
      const repeated = await call(runtime, 'compatibleRoute.prepareChoices', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        choiceCount: 3,
        createdAtMs: 12,
      })
      expect(repeated).toHaveLength(3)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()).toEqual(messageCount)
    } finally {
      runtime.shutdown()
    }
  })

  it('pins historical retries to the old endpoint while current prepares use the new revision', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, '12345678', true)
      const firstInput = routeInput('first123', bundle, 'model-history', 10)
      firstInput.turn.branchId = branchId
      const first = await call(runtime, 'compatibleRoute.prepareTurn', firstInput)
      await call(runtime, 'compatibleRegistry.updateEndpoint', {
        providerInstanceId: bundle.provider.providerInstanceId,
        endpointRevisionId: 'ocp_endpoint_newrev12',
        baseUrl: 'https://new.example.test/v1',
        allowInsecureHttp: false,
        securityPolicy: 'strict_ssrf',
        ordinaryHeaders: [],
        query: [],
        createdAtMs: 20,
      })
      await call(runtime, 'compatibleRegistry.rotateCredential', {
        providerInstanceId: bundle.provider.providerInstanceId,
        credential: {
          credentialVersionRef: 'ocp_credential_rotated1',
          providerInstanceId: bundle.provider.providerInstanceId,
          authMode: 'bearer',
          backend: 'electron_safe_storage',
          maskedSummary: {
            schemaVersion: 1,
            authMode: 'bearer',
            configured: true,
            maskState: 'configured_masked',
            sensitiveHeaderNames: [],
          },
          createdAtMs: 25,
        },
        endpointRevisionId: 'ocp_endpoint_rotated1',
        auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_rotated1' },
        sensitiveHeaderRefs: [],
        createdAtMs: 25,
      })

      const stalePickerInput = routeInput('stale123', bundle, 'model-history', 28)
      stalePickerInput.turn.branchId = branchId
      const stalePicker = await call(runtime, 'compatibleRoute.prepareTurn', stalePickerInput)
      expect(stalePicker.route.endpointRevisionId).toBe(bundle.endpoint.endpointRevisionId)
      expect(stalePicker.route.credentialVersionRef).toBe(bundle.endpoint.credentialVersionRef)

      const historicalInput = routeInput('history12', bundle, 'model-history', 30)
      historicalInput.turn.branchId = branchId
      historicalInput.pinSource = { kind: 'historical', routeProvenanceId: first.route.routeProvenanceId } as any
      const historical = await call(runtime, 'compatibleRoute.prepareTurn', historicalInput)
      expect(historical.route.endpointRevisionId).toBe(first.route.endpointRevisionId)
      expect(historical.route.credentialVersionRef).toBe(first.route.credentialVersionRef)
      expect(historical.route.requestMessageId).not.toBe(first.route.requestMessageId)
      expect((await call(runtime, 'compatibleEndpoint.getRevision', {
        endpointRevisionId: historical.route.endpointRevisionId,
      })).securityPolicy).toBe('compatibility_first')

      const currentInput = routeInput('current12', bundle, 'model-history', 40)
      currentInput.pinSource = { kind: 'selected', pins: {
        ...selectedPins(bundle, 'model-history'),
        endpointRevisionId: 'ocp_endpoint_rotated1',
        credentialVersionRef: 'ocp_credential_rotated1',
      } } as any
      currentInput.turn.branchId = branchId
      const current = await call(runtime, 'compatibleRoute.prepareTurn', currentInput)
      expect(current.route.endpointRevisionId).toBe('ocp_endpoint_rotated1')
      expect(current.route.credentialVersionRef).toBe('ocp_credential_rotated1')
      expect((await call(runtime, 'compatibleEndpoint.getRevision', {
        endpointRevisionId: current.route.endpointRevisionId,
      })).securityPolicy).toBe('strict_ssrf')
    } finally {
      runtime.shutdown()
    }
  })

  it('atomically binds a branch-operation assistant to the exact historical route pins', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, 'bindhist1', true)
      const firstInput = routeInput('bindhist1', bundle, 'model-history', 10)
      firstInput.turn.branchId = branchId
      const first = await call(runtime, 'compatibleRoute.prepareTurn', firstInput)
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: first.route.routeProvenanceId, targetState: 'streaming', atMs: 11 })
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: first.route.routeProvenanceId, targetState: 'completed', atMs: 12 })
      const regen = await call(runtime, 'branch.regenerateFromQuestion', { branchId, questionId: first.questionId })
      const bound = await call(runtime, 'compatibleRoute.prepareExistingHistorical', {
        route: { routeProvenanceId: 'ocp_route_boundhist1', requestId: 'ocp_request_boundhist1', createdAtMs: 20 },
        sourceRouteProvenanceId: first.route.routeProvenanceId,
        branchId,
        questionId: first.questionId,
        assistantId: regen.newAnswerRootId,
      })
      expect(bound.route).toMatchObject({
        requestMessageId: first.questionId,
        endpointRevisionId: first.route.endpointRevisionId,
        credentialVersionRef: first.route.credentialVersionRef,
        requestProfileId: first.route.requestProfileId,
        responseProfileId: first.route.responseProfileId,
      })
      expect(bound.assistantId).toBe(regen.newAnswerRootId)
      expect((await call(runtime, 'message.list', { convoId: bound.convoId })).filter((message: any) => message.id === regen.newAnswerRootId)).toHaveLength(1)
    } finally {
      runtime.shutdown()
    }
  })

  it('creates contiguous choices idempotently and keeps route/message terminal state consistent', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime)
      const input = routeInput('choice123', bundle)
      input.turn.branchId = branchId
      const prepared = await call(runtime, 'compatibleRoute.prepareTurn', input)
      await expect(call(runtime, 'compatibleRoute.addChoiceMessage', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        choiceIndex: 2,
        createdAtMs: 11,
      })).rejects.toThrow(/contiguous/i)
      const choice1 = await call(runtime, 'compatibleRoute.addChoiceMessage', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        choiceIndex: 1,
        createdAtMs: 11,
      })
      const choice1Again = await call(runtime, 'compatibleRoute.addChoiceMessage', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        choiceIndex: 1,
        createdAtMs: 99,
      })
      expect(choice1Again.messageId).toBe(choice1.messageId)

      const streaming = await call(runtime, 'compatibleRoute.transition', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        targetState: 'streaming',
        atMs: 12,
      })
      expect((await call(runtime, 'compatibleRoute.transition', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        targetState: 'streaming',
        atMs: 99,
      })).updatedAtMs).toBe(streaming.updatedAtMs)
      const completed = await call(runtime, 'compatibleRoute.transition', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        targetState: 'completed',
        atMs: 13,
      })
      expect(completed.state).toBe('completed')
      expect(runtime.db.prepare(`SELECT DISTINCT status FROM message WHERE id IN (SELECT message_id FROM compatible_route_choices)`).all()).toEqual([{ status: 'final' }])
      await expect(call(runtime, 'compatibleRoute.transition', {
        routeProvenanceId: prepared.route.routeProvenanceId,
        targetState: 'failed',
        atMs: 14,
      })).rejects.toThrow(/terminal/i)
    } finally {
      runtime.shutdown()
    }
  })

  it('recovers only incomplete routes as interrupted without fabricating completion', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime)
      const firstInput = routeInput('recover1', bundle, 'model-a', 10)
      firstInput.turn.branchId = branchId
      const first = await call(runtime, 'compatibleRoute.prepareTurn', firstInput)
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: first.route.routeProvenanceId, targetState: 'streaming', atMs: 11 })

      const completedInput = routeInput('complete1', bundle, 'model-a', 12)
      completedInput.turn.branchId = branchId
      const completedTurn = await call(runtime, 'compatibleRoute.prepareTurn', completedInput)
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: completedTurn.route.routeProvenanceId, targetState: 'streaming', atMs: 13 })
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: completedTurn.route.routeProvenanceId, targetState: 'completed', atMs: 14 })

      const recovery = await call(runtime, 'compatibleRoute.recoverIncomplete', { atMs: 20 })
      expect(recovery).toMatchObject({ recovered: 1, projectedRouteIds: ['ocp_route_recover1'] })
      const recovered = await call(runtime, 'compatibleRoute.get', { routeProvenanceId: first.route.routeProvenanceId })
      expect(recovered).toMatchObject({ state: 'interrupted', terminalAtMs: 20 })
      expect(runtime.db.prepare(`SELECT status FROM message WHERE id = ?`).get(first.assistantId)).toEqual({ status: 'error' })
      expect(runtime.db.prepare(`SELECT body FROM message_body WHERE message_id = ?`).get(first.assistantId)).toEqual({ body: '' })
      expect(await call(runtime, 'compatibleRoute.get', { routeProvenanceId: completedTurn.route.routeProvenanceId })).toMatchObject({ state: 'completed', terminalAtMs: 14 })
      expect(runtime.db.prepare(`SELECT status FROM message WHERE id = ?`).get(completedTurn.assistantId)).toEqual({ status: 'final' })
      expect((await call(runtime, 'compatibleRoute.recoverIncomplete', { atMs: 30 })).recovered).toBe(0)
    } finally {
      runtime.shutdown()
    }
  })

  it('rolls back terminal child writes when atomic bundle finalization fails', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime)
      const input = routeInput('atomic12', bundle)
      input.turn.branchId = branchId
      const prepared = await call(runtime, 'compatibleRoute.prepareTurn', input)
      await call(runtime, 'compatibleRoute.transition', { routeProvenanceId: prepared.route.routeProvenanceId, targetState: 'streaming', atMs: 11 })
      const original = runtime.compatibleTurnProjectionRepo.finalizeRoute.bind(runtime.compatibleTurnProjectionRepo)
      runtime.compatibleTurnProjectionRepo.finalizeRoute = (() => { throw new Error('injected terminal failure') }) as typeof original
      await expect(call(runtime, 'compatibleProjection.finalizeBundle', {
        routeProvenanceId: prepared.route.routeProvenanceId, status: 'completed', atMs: 12,
        choices: [{
          routeProvenanceId: prepared.route.routeProvenanceId, messageId: prepared.assistantId, choiceIndex: 0,
          status: 'completed', terminalCause: 'done', checkpointCompleteness: 'complete', lastSequence: 1,
          blocks: [], finishReason: 'stop', usage: null, error: null, rawExtensionRecordIds: [], toolResultMessageIds: [],
          reasoning: { mappingId: bundle.reasoningMapping.mappingId, mappingVersion: 1, mode: 'custom_preferred_with_builtin_fallback', lockedSource: null, lockedSourceKey: null, selectedSegmentIds: [], conflicts: [] },
        }],
        tools: [], reasoning: [], rawExtensions: [],
        discovery: [{
          providerInstanceId: bundle.provider.providerInstanceId, responseProfileId: bundle.responseProfile.responseProfileId,
          profileVersion: 1, streamPath: '$.unexpected', state: 'candidate',
          aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: { kind: 'redacted', valueType: 'string', originalLength: null }, sampleCount: 1 },
          occurrenceCount: 1, firstObservedAtMs: 12, lastObservedAtMs: 12,
        }],
      })).rejects.toThrow('injected terminal failure')
      expect(await call(runtime, 'compatibleDiagnostics.getDiscoveredField', {
        providerInstanceId: bundle.provider.providerInstanceId, responseProfileId: bundle.responseProfile.responseProfileId,
        profileVersion: 1, streamPath: '$.unexpected',
      })).toBeNull()
      expect(await call(runtime, 'compatibleRoute.get', { routeProvenanceId: prepared.route.routeProvenanceId })).toMatchObject({ state: 'streaming' })
    } finally {
      runtime.shutdown()
    }
  })

  it('materializes the New template and compatible route provenance in one transaction', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const bundle = providerBundle('template12', false)
      await call(runtime, 'compatibleRegistry.create', bundle)
      const initial = await call(runtime, 'systemChatTemplate.get')
      await call(runtime, 'conversationDraft.updateText', {
        conversationId: initial.conversation.id,
        draftText: 'atomic compatible question',
        draftMode: 'compose',
        editingSourceMessageId: null,
      })
      const ready = await call(runtime, 'systemChatTemplate.get')
      const result = await call(runtime, 'systemChatTemplate.materializeAndBeginTurn', {
        templateConversationId: ready.conversation.id,
        expectedTemplateRevision: ready.conversation.templateRevision,
        requestId: 'materialize-compatible-template-1',
        compatibleRoute: {
          route: {
            routeProvenanceId: 'ocp_route_template12',
            requestId: 'ocp_request_template12',
            providerInstanceId: bundle.provider.providerInstanceId,
            modelId: 'model-template',
            createdAtMs: 20,
          },
          pins: selectedPins(bundle, 'model-template'),
        },
      })
      expect(result).toMatchObject({ routeProvenanceId: 'ocp_route_template12' })
      expect(await call(runtime, 'compatibleRoute.getPreparedTurn', {
        routeProvenanceId: result.routeProvenanceId,
        branchId: result.branchId,
        questionId: result.questionId,
        assistantId: result.assistantId,
      })).toMatchObject({
        convoId: result.convoId,
        route: { state: 'prepared', requestMessageId: result.questionId, modelId: 'model-template' },
        choice: { messageId: result.assistantId },
      })
      expect(runtime.db.prepare('SELECT COUNT(*) AS count FROM new_chat_materializations').get()).toEqual({ count: 1 })
    } finally {
      runtime.shutdown()
    }
  })
})

describe('compatible main route coordinator ordering and blocked outcomes', () => {
  it('returns only after the complete provenance graph is committed and never invokes a factory on rollback', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime)
      const coordinator = createCompatibleRouteCoordinator({
        db: { call: (method, params) => call(runtime, method, params) },
        credentials: { has: () => true } as any,
        nowMs: () => 100,
      })
      const outcome = await coordinator.prepareTurn({
        selection: selectedPins(bundle),
        turn: { branchId, userBody: 'committed first' },
      })
      expect(outcome.ok).toBe(true)
      const transportFactory = vi.fn((route: any) => {
        expect(runtime.db.prepare(`SELECT state FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(route.routeProvenanceId)).toEqual({ state: 'prepared' })
        expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_route_choices WHERE route_provenance_id = ?`).get(route.routeProvenanceId)).toEqual({ count: 1 })
      })
      if (outcome.ok) transportFactory(outcome.value.route)
      expect(transportFactory).toHaveBeenCalledTimes(1)

      await call(runtime, 'compatibleRegistry.updateEndpoint', {
        providerInstanceId: bundle.provider.providerInstanceId,
        endpointRevisionId: 'ocp_endpoint_coordnew',
        baseUrl: 'https://coordinator-new.example.test/v1',
        allowInsecureHttp: false,
        securityPolicy: 'compatibility_first',
        ordinaryHeaders: [],
        query: [],
        createdAtMs: 101,
      })
      const historical = await coordinator.prepareHistoricalTurn({
        source: { kind: 'route', routeProvenanceId: outcome.ok ? outcome.value.route.routeProvenanceId : '' },
        turn: { branchId, userBody: 'historical pins' },
      })
      expect(historical).toMatchObject({
        ok: true,
        value: { route: { endpointRevisionId: bundle.endpoint.endpointRevisionId } },
      })

      runtime.db.exec(`CREATE TRIGGER fail_route_prepare BEFORE INSERT ON compatible_route_provenance BEGIN SELECT RAISE(ABORT, 'injected route failure'); END;`)
      const before = runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()
      await expect(coordinator.prepareTurn({
        selection: selectedPins(bundle),
        turn: { branchId, userBody: 'rollback before factory' },
      })).rejects.toThrow(/injected route failure/i)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM message`).get()).toEqual(before)
      expect(transportFactory).toHaveBeenCalledTimes(1)
    } finally {
      runtime.shutdown()
    }
  })

  it('persists and terminalizes an explicit blocked route for deleted or missing credentials', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, 'auth1234', true)
      await call(runtime, 'compatibleCredential.deleteDescriptor', {
        credentialVersionRef: bundle.credential!.credentialVersionRef,
        deletedAtMs: 5,
      })
      const coordinator = createCompatibleRouteCoordinator({
        db: { call: (method, params) => call(runtime, method, params) },
        credentials: { has: () => false } as any,
        nowMs: () => 100,
      })
      const deleted = await coordinator.prepareTurn({
        selection: selectedPins(bundle),
        turn: { branchId, userBody: 'deleted credential' },
      })
      expect(deleted).toMatchObject({ ok: false, code: 'credential_deleted', value: { route: { state: 'interrupted' } } })
      if (!deleted.ok && deleted.value) {
        expect(runtime.db.prepare(`SELECT status FROM message WHERE id = ?`).get(deleted.value.assistantId)).toEqual({ status: 'error' })
      }

      const missingSetup = await setup(runtime, 'missing12', true)
      const missing = await coordinator.prepareTurn({
        selection: selectedPins(missingSetup.bundle),
        turn: { branchId: missingSetup.branchId, userBody: 'missing secure payload' },
      })
      expect(missing).toMatchObject({ ok: false, code: 'credential_missing', value: { route: { state: 'interrupted' } } })

      const disabledSetup = await setup(runtime, 'disable12', false)
      await call(runtime, 'compatibleProvider.update', {
        providerInstanceId: disabledSetup.bundle.provider.providerInstanceId,
        status: 'disabled',
        updatedAtMs: 7,
      })
      const disabled = await coordinator.prepareTurn({
        selection: selectedPins(disabledSetup.bundle),
        turn: { branchId: disabledSetup.branchId, userBody: 'disabled provider' },
      })
      expect(disabled).toMatchObject({ ok: false, code: 'provider_disabled', value: { route: { state: 'interrupted' } } })

      const deletedSetup = await setup(runtime, 'delete123', false)
      await call(runtime, 'compatibleProvider.tombstone', {
        providerInstanceId: deletedSetup.bundle.provider.providerInstanceId,
        deletedAtMs: 8,
      })
      const providerDeleted = await coordinator.prepareTurn({
        selection: selectedPins(deletedSetup.bundle),
        turn: { branchId: deletedSetup.branchId, userBody: 'deleted provider' },
      })
      expect(providerDeleted).toMatchObject({ ok: false, code: 'provider_deleted', value: { route: { state: 'interrupted' } } })
    } finally {
      runtime.shutdown()
    }
  })
})

describe('compatible production runtime with real SQLite worker and mocked transport', () => {
  it('persists prepared, streaming and terminal projections without any external request', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const { bundle, branchId } = await setup(runtime, 'runtime12', true)
      const db = { call: (method: any, params?: unknown) => call(runtime, method, params) }
      const credentials = {
        has: vi.fn(() => true),
        readForMain: vi.fn(() => ({ mode: 'bearer' as const, token: 'mock-only-secret' })),
      }
      const transport = { preflight: vi.fn(async () => ({ ok: true as const })), request: vi.fn(async (request: any) => {
        expect(request.operation).toBe('chat_completions')
        expect(JSON.parse(request.body)).toMatchObject({ model: 'model-runtime', stream: false })
        request.resolveCredential?.()
        return {
          ok: true as const,
          response: new Response(JSON.stringify({
            id: 'mock-response', object: 'chat.completion', created: 1, model: 'model-runtime',
            choices: [{ index: 0, message: { role: 'assistant', content: 'sqlite result' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
          }), { status: 200, headers: { 'content-type': 'application/json' } }),
          diagnostics: {},
        }
      }) }
      const service = createCompatibleChatRuntimeService({
        db, credentials: credentials as any, transport: transport as any,
        requests: createCompatibleRequestRegistry(),
        routes: createCompatibleRouteCoordinator({ db, credentials: credentials as any, nowMs: () => 50 }),
        nowMs: () => 50,
      })
      const events: any[] = []
      const result = await service.start({
        requestId: 'runtime-sqlite-1', ownerWebContentsId: 7,
        selection: {
          providerInstanceId: bundle.provider.providerInstanceId, modelId: 'model-runtime',
          endpointRevisionId: bundle.endpoint.endpointRevisionId, credentialVersionRef: bundle.endpoint.credentialVersionRef,
          requestProfileId: bundle.requestProfile.requestProfileId, requestProfileVersion: 1,
          responseProfileId: bundle.responseProfile.responseProfileId, responseProfileVersion: 1,
          reasoningMappingId: bundle.reasoningMapping.mappingId, reasoningMappingVersion: 1,
          inlinePolicyId: bundle.inlinePolicy.inlinePolicyId, inlinePolicyVersion: 1,
        },
        turn: { branchId, userBody: 'question' },
        messages: [{ role: 'user', content: 'question' }], stream: false,
      }, (event) => events.push(event))
      expect(transport.request).toHaveBeenCalledTimes(1)
      expect(credentials.readForMain).toHaveBeenCalledWith(result.route.credentialVersionRef)
      expect(await call(runtime, 'compatibleRoute.get', { routeProvenanceId: result.route.routeProvenanceId })).toMatchObject({ state: 'completed' })
      expect(await call(runtime, 'compatibleProjection.loadRoute', { routeProvenanceId: result.route.routeProvenanceId })).toEqual([
        expect.objectContaining({ status: 'completed', blocks: [expect.objectContaining({ kind: 'content', text: 'sqlite result' })] }),
      ])
      expect(events).toContainEqual(expect.objectContaining({ kind: 'terminal', outcome: 'done' }))
    } finally {
      runtime.shutdown()
    }
  })
})
