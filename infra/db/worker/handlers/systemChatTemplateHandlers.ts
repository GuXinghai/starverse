import { z } from 'zod'
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import { DbWorkerError } from '../../errors'
import { beginTurnPersistenceCore } from '../turnPersistence'
import {
  compatibleRoutePrepareIdentitySchema,
  compatibleRouteSelectedPinsSchema,
} from '../../../../src/shared/provider/openai-chat-compatible'

const resetSchema = z.object({
  templateConversationId: z.string().min(1),
  expectedTemplateRevision: z.number().int().nonnegative(),
  resetModelConfig: z.boolean(),
  resetDraftAttachments: z.boolean(),
}).strict()

const materializeSchema = z.object({
  templateConversationId: z.string().min(1),
  expectedTemplateRevision: z.number().int().nonnegative(),
  requestId: z.string().trim().min(1).max(256),
  userMeta: z.record(z.unknown()).nullable().optional(),
  sentAssetIds: z.array(z.string().min(1)).max(512).optional(),
  dfcAttachmentSendSnapshots: z.array(z.unknown()).max(512).optional(),
  compatibleRoute: z.object({
    route: compatibleRoutePrepareIdentitySchema,
    pins: compatibleRouteSelectedPinsSchema,
  }).strict().optional(),
}).strict()

export function registerSystemChatTemplateHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any
  const loadTemplate = () => {
    const convo = runtime.db.prepare(`
      SELECT id, project_id, title, created_at, updated_at, meta, system_key, template_revision
      FROM convo WHERE system_key = 'new_template' LIMIT 2
    `).all() as any[]
    if (convo.length !== 1 || convo[0].id !== runtime.newTemplateConvoId) {
      throw new DbWorkerError('ERR_INVALID', 'new_chat_template_identity_invalid')
    }
    return convo[0]
  }
  const clearDraft = (conversationId: string, attachments: readonly { assetId: string }[]) => {
    for (const attachment of attachments) {
      rt.conversationAttachmentService.removeDraftAttachment({ conversationId, assetId: attachment.assetId })
    }
    rt.conversationDraftRepo.updateText({
      conversationId,
      draftText: '',
      draftMode: 'compose',
      editingSourceMessageId: null,
      updatedAt: Date.now(),
    })
  }
  const snapshot = () => {
    const row = loadTemplate()
    return {
      conversation: {
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        meta: row.meta ? JSON.parse(row.meta) : null,
        systemKey: row.system_key,
        templateRevision: Number(row.template_revision ?? 0),
      },
      draft: rt.conversationDraftRepo.getOrCreate(row.id),
      settings: rt.settingsRepo.getNewChatLifecycleSettings(),
    }
  }

  register('systemChatTemplate.get', () => snapshot())

  register('systemChatTemplate.updateConfig', (raw) => {
    const input = z.object({
      templateConversationId: z.string().min(1),
      expectedTemplateRevision: z.number().int().nonnegative(),
      meta: z.record(z.unknown()).nullable(),
    }).strict().parse(raw)
    const txn = runtime.db.transaction(() => {
      const row = loadTemplate()
      if (row.id !== input.templateConversationId || Number(row.template_revision) !== input.expectedTemplateRevision) {
        throw new DbWorkerError('ERR_INVALID', 'new_chat_template_revision_conflict')
      }
      runtime.db.prepare(`
        UPDATE convo SET meta = ?, template_revision = template_revision + 1, updated_at = ? WHERE id = ?
      `).run(input.meta ? JSON.stringify(input.meta) : null, Date.now(), row.id)
      return snapshot()
    })
    return txn.immediate()
  })

  register('systemChatTemplate.reset', (raw) => {
    const input = resetSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const row = loadTemplate()
      if (row.id !== input.templateConversationId || Number(row.template_revision) !== input.expectedTemplateRevision) {
        throw new DbWorkerError('ERR_INVALID', 'new_chat_template_revision_conflict')
      }
      const draft = rt.conversationDraftRepo.getOrCreate(row.id)
      if (input.resetDraftAttachments) clearDraft(row.id, draft.attachments)
      if (input.resetModelConfig) {
        runtime.db.prepare('UPDATE convo SET meta = NULL WHERE id = ?').run(row.id)
      }
      runtime.db.prepare(`
        UPDATE convo SET template_revision = template_revision + 1, updated_at = ? WHERE id = ?
      `).run(Date.now(), row.id)
      return snapshot()
    })
    return txn.immediate()
  })

  register('systemChatTemplate.materializeAndBeginTurn', (raw) => {
    const input = materializeSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const existing = runtime.db.prepare(`
        SELECT receipt.request_id, receipt.template_convo_id, receipt.template_revision,
               receipt.target_convo_id, receipt.branch_id, receipt.question_id, receipt.assistant_id,
               route.route_provenance_id
        FROM new_chat_materializations receipt
        LEFT JOIN compatible_route_provenance route ON route.request_message_id = receipt.question_id
        WHERE receipt.request_id = ?
      `).get(input.requestId) as any
      if (existing) {
        const seqRows = runtime.db.prepare('SELECT id, seq FROM message WHERE id IN (?, ?)').all(
          existing.question_id, existing.assistant_id,
        ) as Array<{ id: string; seq: number }>
        const seq = new Map(seqRows.map((item) => [item.id, item.seq]))
        return {
          ok: true, idempotent: true,
          templateConversationId: existing.template_convo_id,
          templateRevision: existing.template_revision,
          convoId: existing.target_convo_id,
          branchId: existing.branch_id,
          questionId: existing.question_id,
          questionSeq: seq.get(existing.question_id) ?? 0,
          assistantId: existing.assistant_id,
          assistantSeq: seq.get(existing.assistant_id) ?? 0,
          ...(existing.route_provenance_id ? { routeProvenanceId: existing.route_provenance_id } : {}),
        }
      }
      const row = loadTemplate()
      if (row.id !== input.templateConversationId || Number(row.template_revision) !== input.expectedTemplateRevision) {
        throw new DbWorkerError('ERR_INVALID', 'new_chat_template_revision_conflict')
      }
      const draft = rt.conversationDraftRepo.getOrCreate(row.id)
      if (!String(draft.draftText ?? '').trim() && draft.attachments.length === 0) {
        throw new DbWorkerError('ERR_INVALID', 'new_chat_template_empty')
      }
      const target = rt.convoRepo.create({
        projectId: runtime.inboxId,
        title: 'New Chat',
        meta: row.meta ? JSON.parse(row.meta) : null,
      })
      const branch = rt.branchRepo.ensureDefault(target.id, 'Main')
      rt.conversationDraftRepo.updateText({
        conversationId: target.id,
        draftText: draft.draftText,
        draftMode: 'compose',
        editingSourceMessageId: null,
        updatedAt: Date.now(),
      })
      for (const attachment of draft.attachments) {
        rt.conversationAttachmentService.addDraftAttachment({
          conversationId: target.id,
          assetId: attachment.assetId,
          attachmentOrder: attachment.attachmentOrder,
          includeInNextRequest: attachment.includeInNextRequest,
          excludedReason: attachment.excludedReason,
          preferredSendMode: attachment.preferredSendMode,
          urlRetentionMode: attachment.urlRetentionMode,
          dfcManaged: attachment.dfcManaged,
          selectedOptionId: attachment.selectedOptionId,
          selectedAssetRefs: attachment.selectedAssetRefs,
        })
      }
      const begun = beginTurnPersistenceCore(runtime, {
        branchId: branch.id,
        userBody: draft.draftText,
        ...(input.userMeta !== undefined ? { userMeta: input.userMeta } : {}),
        attachConversationDraft: true,
        ...(input.sentAssetIds ? { sentAssetIds: input.sentAssetIds } : {}),
        ...(input.dfcAttachmentSendSnapshots
          ? { dfcAttachmentSendSnapshots: input.dfcAttachmentSendSnapshots as any[] }
          : {}),
      })
      let routeProvenanceId: string | undefined
      if (input.compatibleRoute) {
        const { route, pins } = input.compatibleRoute
        const provider = runtime.compatibleProviderRepo.getProvider(pins.providerInstanceId)
        const endpoint = runtime.compatibleProviderRepo.getEndpointRevision(pins.endpointRevisionId)
        if (!provider || provider.status !== 'active' || !endpoint || endpoint.providerInstanceId !== pins.providerInstanceId ||
            endpoint.credentialVersionRef !== pins.credentialVersionRef ||
            endpoint.requestProfileId !== pins.requestProfileId || endpoint.requestProfileVersion !== pins.requestProfileVersion ||
            endpoint.responseProfileId !== pins.responseProfileId || endpoint.responseProfileVersion !== pins.responseProfileVersion) {
          throw new DbWorkerError('ERR_INVALID', 'compatible_selection_pins_stale')
        }
        if (endpoint.credentialVersionRef) {
          const descriptor = runtime.compatibleProviderRepo.getCredentialDescriptor(endpoint.credentialVersionRef)
          if (!descriptor || descriptor.providerInstanceId !== pins.providerInstanceId || descriptor.deletedAtMs != null) {
            throw new DbWorkerError('ERR_INVALID', 'compatible_credential_descriptor_missing')
          }
        }
        const requestProfile = runtime.compatibleProfileRepo.getRequestProfile(endpoint.requestProfileId, endpoint.requestProfileVersion)
        const responseProfile = runtime.compatibleProfileRepo.getResponseProfile(endpoint.responseProfileId, endpoint.responseProfileVersion)
        if (!requestProfile || !responseProfile || responseProfile.reasoningMappingId !== pins.reasoningMappingId ||
            responseProfile.reasoningMappingVersion !== pins.reasoningMappingVersion ||
            responseProfile.inlinePolicyId !== pins.inlinePolicyId || responseProfile.inlinePolicyVersion !== pins.inlinePolicyVersion) {
          throw new DbWorkerError('ERR_INVALID', 'compatible_selection_profiles_stale')
        }
        const reasoning = runtime.compatibleProfileRepo.getReasoningMapping(pins.reasoningMappingId, pins.reasoningMappingVersion)
        const inlinePolicy = runtime.compatibleProfileRepo.getInlinePolicy(pins.inlinePolicyId, pins.inlinePolicyVersion)
        if (!reasoning || !inlinePolicy) throw new DbWorkerError('ERR_INVALID', 'compatible_selection_profiles_stale')
        const compatibleRoute = runtime.compatibleRouteRepo.createRouteWithChoices({
          ...route,
          requestMessageId: begun.questionId,
          protocolKey: 'openai_chat_compatible',
          providerInstanceId: pins.providerInstanceId,
          modelId: pins.modelId,
          endpointRevisionId: pins.endpointRevisionId,
          credentialVersionRef: pins.credentialVersionRef,
          requestProfileId: pins.requestProfileId,
          requestProfileVersion: pins.requestProfileVersion,
          responseProfileId: pins.responseProfileId,
          responseProfileVersion: pins.responseProfileVersion,
          reasoningMappingId: pins.reasoningMappingId,
          reasoningMappingVersion: pins.reasoningMappingVersion,
          reasoningMode: reasoning.mode,
          inlinePolicyId: pins.inlinePolicyId,
          inlinePolicyVersion: pins.inlinePolicyVersion,
          state: 'prepared',
        }, [{
          routeProvenanceId: route.routeProvenanceId,
          choiceIndex: 0,
          messageId: begun.assistantId,
          createdAtMs: route.createdAtMs,
        }])
        const availability = runtime.compatibleRouteRepo.getAvailability(compatibleRoute.routeProvenanceId)
        if (!availability?.available) throw new DbWorkerError('ERR_INVALID', availability?.code ?? 'compatible_route_unavailable')
        routeProvenanceId = compatibleRoute.routeProvenanceId
      }
      clearDraft(row.id, draft.attachments)
      const lifecycle = rt.settingsRepo.getNewChatLifecycleSettings()
      if (lifecycle.postSendTemplateReset === 'reset_all') {
        runtime.db.prepare('UPDATE convo SET meta = NULL WHERE id = ?').run(row.id)
      }
      const nextRevision = Number(row.template_revision) + 1
      runtime.db.prepare(`
        UPDATE convo SET template_revision = ?, updated_at = ? WHERE id = ?
      `).run(nextRevision, Date.now(), row.id)
      runtime.db.prepare(`
        INSERT INTO new_chat_materializations(
          request_id, template_convo_id, template_revision, target_convo_id,
          branch_id, question_id, assistant_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.requestId, row.id, Number(row.template_revision), target.id, branch.id, begun.questionId, begun.assistantId, Date.now())
      const convoRow = rt.loadConvoRow(target.id)
      if (convoRow) rt.searchRepo.upsertDoc(rt.buildConvoSearchDocFromRow(convoRow))
      return {
        ...begun,
        idempotent: false,
        templateConversationId: row.id,
        templateRevision: nextRevision,
        ...(routeProvenanceId ? { routeProvenanceId } : {}),
      }
    })
    const result = txn.immediate()
    rt.emitActivityUpdated(result.convoId)
    return result
  })
}
