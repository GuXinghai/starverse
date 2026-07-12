import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
  compatibleChoiceIndexSchema,
  compatibleMessageIdSchema,
  compatibleModelIdSchema,
  compatibleProfileVersionSchema,
  compatibleRequestIdSchema,
  compatibleRouteTransitionSchema,
  credentialVersionRefSchema,
  endpointRevisionIdSchema,
  inlinePolicyIdSchema,
  providerInstanceIdSchema,
  reasoningMappingIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  routeProvenanceIdSchema,
  type CompatibleRouteChoice,
  type CompatibleRouteAvailability,
  type CompatibleRouteProvenance,
} from '../../../src/shared/provider/openai-chat-compatible'

const timestampSchema = z.number().int().nonnegative()

export const CreateCompatibleRouteProvenanceInputSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  requestId: compatibleRequestIdSchema,
  requestMessageId: compatibleMessageIdSchema,
  protocolKey: z.literal(OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY),
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
  endpointRevisionId: endpointRevisionIdSchema,
  credentialVersionRef: credentialVersionRefSchema.nullable(),
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: compatibleProfileVersionSchema,
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: compatibleProfileVersionSchema,
  reasoningMappingId: reasoningMappingIdSchema,
  reasoningMappingVersion: compatibleProfileVersionSchema,
  reasoningMode: z.enum(['custom_preferred_with_builtin_fallback', 'custom_only']),
  inlinePolicyId: inlinePolicyIdSchema,
  inlinePolicyVersion: compatibleProfileVersionSchema,
  state: z.literal('prepared'),
  createdAtMs: timestampSchema,
}).strict()

export const CreateCompatibleRouteChoiceInputSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  messageId: compatibleMessageIdSchema,
  createdAtMs: timestampSchema,
}).strict()

export type CreateCompatibleRouteProvenanceInput = z.input<typeof CreateCompatibleRouteProvenanceInputSchema>
export type CreateCompatibleRouteChoiceInput = z.input<typeof CreateCompatibleRouteChoiceInputSchema>

type RouteRow = {
  route_provenance_id: string
  request_id: string
  request_message_id: string
  protocol_key: typeof OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY
  provider_instance_id: string
  model_id: string
  endpoint_revision_id: string
  credential_version_ref: string | null
  request_profile_id: string
  request_profile_version: number
  response_profile_id: string
  response_profile_version: number
  reasoning_mapping_id: string
  reasoning_mapping_version: number
  reasoning_mode: CompatibleRouteProvenance['reasoningMode']
  inline_policy_id: string
  inline_policy_version: number
  state: CompatibleRouteProvenance['state']
  created_at_ms: number
  updated_at_ms: number
  terminal_at_ms: number | null
}

function mapRoute(row: RouteRow): CompatibleRouteProvenance {
  return {
    routeProvenanceId: routeProvenanceIdSchema.parse(row.route_provenance_id),
    requestId: row.request_id,
    requestMessageId: row.request_message_id,
    protocolKey: OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
    providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
    modelId: row.model_id,
    endpointRevisionId: endpointRevisionIdSchema.parse(row.endpoint_revision_id),
    credentialVersionRef: row.credential_version_ref ? credentialVersionRefSchema.parse(row.credential_version_ref) : null,
    requestProfileId: requestProfileIdSchema.parse(row.request_profile_id),
    requestProfileVersion: row.request_profile_version,
    responseProfileId: responseProfileIdSchema.parse(row.response_profile_id),
    responseProfileVersion: row.response_profile_version,
    reasoningMappingId: reasoningMappingIdSchema.parse(row.reasoning_mapping_id),
    reasoningMappingVersion: row.reasoning_mapping_version,
    reasoningMode: row.reasoning_mode,
    inlinePolicyId: inlinePolicyIdSchema.parse(row.inline_policy_id),
    inlinePolicyVersion: row.inline_policy_version,
    state: row.state,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    terminalAtMs: row.terminal_at_ms,
  }
}

export class CompatibleRouteRepo {
  private readonly createRouteWithChoicesTransaction: (
    route: CreateCompatibleRouteProvenanceInput,
    choices: readonly CreateCompatibleRouteChoiceInput[],
  ) => CompatibleRouteProvenance

  constructor(private readonly db: BetterSqlite3.Database) {
    this.createRouteWithChoicesTransaction = db.transaction((rawRoute, rawChoices) => {
      const route = CreateCompatibleRouteProvenanceInputSchema.parse(rawRoute)
      const choices = z.array(CreateCompatibleRouteChoiceInputSchema).max(1025).parse(rawChoices)
      const requestMessage = this.db.prepare(`SELECT role, convo_id FROM message WHERE id = ?`).get(route.requestMessageId) as {
        role: string
        convo_id: string
      } | undefined
      if (!requestMessage || requestMessage.role !== 'user') {
        throw new Error('Compatible route requestMessageId must reference a persisted user message.')
      }
      const endpoint = this.db.prepare(`
        SELECT credential_version_ref,
               request_profile_id, request_profile_version,
               response_profile_id, response_profile_version
        FROM compatible_endpoint_revisions
        WHERE endpoint_revision_id = ? AND provider_instance_id = ?
      `).get(route.endpointRevisionId, route.providerInstanceId) as {
        credential_version_ref: string | null
        request_profile_id: string
        request_profile_version: number
        response_profile_id: string
        response_profile_version: number
      } | undefined
      if (!endpoint ||
          endpoint.credential_version_ref !== route.credentialVersionRef ||
          endpoint.request_profile_id !== route.requestProfileId ||
          endpoint.request_profile_version !== route.requestProfileVersion ||
          endpoint.response_profile_id !== route.responseProfileId ||
          endpoint.response_profile_version !== route.responseProfileVersion) {
        throw new Error('Compatible route credential and profile refs must match the endpoint revision.')
      }
      const responseProfile = this.db.prepare(`
        SELECT profile.reasoning_mapping_id, profile.reasoning_mapping_version,
               profile.inline_policy_id, profile.inline_policy_version,
               reasoning.mode AS reasoning_mode
        FROM compatible_response_profiles profile
        JOIN compatible_reasoning_mappings reasoning
          ON reasoning.mapping_id = profile.reasoning_mapping_id
         AND reasoning.version = profile.reasoning_mapping_version
        WHERE profile.response_profile_id = ? AND profile.version = ?
      `).get(route.responseProfileId, route.responseProfileVersion) as {
        reasoning_mapping_id: string
        reasoning_mapping_version: number
        inline_policy_id: string
        inline_policy_version: number
        reasoning_mode: CompatibleRouteProvenance['reasoningMode']
      } | undefined
      if (!responseProfile ||
          responseProfile.reasoning_mapping_id !== route.reasoningMappingId ||
          responseProfile.reasoning_mapping_version !== route.reasoningMappingVersion ||
          responseProfile.reasoning_mode !== route.reasoningMode ||
          responseProfile.inline_policy_id !== route.inlinePolicyId ||
          responseProfile.inline_policy_version !== route.inlinePolicyVersion) {
        throw new Error('Compatible route response/reasoning/inline profile references must match.')
      }
      if (choices.some((choice) => choice.routeProvenanceId !== route.routeProvenanceId)) {
        throw new Error('Every route choice must reference the new route provenance ID.')
      }
      const indexes = new Set(choices.map((choice) => choice.choiceIndex))
      const messages = new Set(choices.map((choice) => choice.messageId))
      if (indexes.size !== choices.length || messages.size !== choices.length) {
        throw new Error('Compatible route choices require unique indexes and message IDs.')
      }
      this.insertRoute(route)
      for (const choice of choices) this.insertChoice(choice)
      return this.getRoute(route.routeProvenanceId)!
    })
  }

  createRouteWithChoices(
    route: CreateCompatibleRouteProvenanceInput,
    choices: readonly CreateCompatibleRouteChoiceInput[] = [],
  ): CompatibleRouteProvenance {
    return this.createRouteWithChoicesTransaction(route, choices)
  }

  private insertRoute(route: z.output<typeof CreateCompatibleRouteProvenanceInputSchema>) {
    this.db.prepare(`
      INSERT INTO compatible_route_provenance (
        route_provenance_id, request_id, request_message_id, protocol_key, provider_instance_id, model_id,
        endpoint_revision_id, credential_version_ref,
        request_profile_id, request_profile_version,
        response_profile_id, response_profile_version,
        reasoning_mapping_id, reasoning_mapping_version, reasoning_mode,
        inline_policy_id, inline_policy_version, state, created_at_ms, updated_at_ms, terminal_at_ms
      ) VALUES (
        @routeProvenanceId, @requestId, @requestMessageId, @protocolKey, @providerInstanceId, @modelId,
        @endpointRevisionId, @credentialVersionRef,
        @requestProfileId, @requestProfileVersion,
        @responseProfileId, @responseProfileVersion,
        @reasoningMappingId, @reasoningMappingVersion, @reasoningMode,
        @inlinePolicyId, @inlinePolicyVersion, @state, @createdAtMs, @createdAtMs, NULL
      )
    `).run(route)
  }

  addChoice(input: CreateCompatibleRouteChoiceInput): CompatibleRouteChoice {
    const choice = CreateCompatibleRouteChoiceInputSchema.parse(input)
    this.insertChoice(choice)
    return this.listChoices(choice.routeProvenanceId).find((item) => item.choiceIndex === choice.choiceIndex)!
  }

  private insertChoice(choice: z.output<typeof CreateCompatibleRouteChoiceInputSchema>) {
    const message = this.db.prepare(`
      SELECT choice_message.role,
             choice_message.convo_id AS choice_convo_id,
             request_message.convo_id AS request_convo_id
      FROM compatible_route_provenance route
      JOIN message request_message ON request_message.id = route.request_message_id
      JOIN message choice_message ON choice_message.id = ?
      WHERE route.route_provenance_id = ?
    `).get(choice.messageId, choice.routeProvenanceId) as {
      role: string
      choice_convo_id: string
      request_convo_id: string
    } | undefined
    if (!message || message.role !== 'assistant' || message.choice_convo_id !== message.request_convo_id) {
      throw new Error('Compatible route choices must reference persisted assistant messages in the request conversation.')
    }
    this.db.prepare(`
      INSERT INTO compatible_route_choices (route_provenance_id, choice_index, message_id, created_at_ms)
      VALUES (@routeProvenanceId, @choiceIndex, @messageId, @createdAtMs)
    `).run(choice)
  }

  getRoute(routeProvenanceId: unknown): CompatibleRouteProvenance | null {
    const id = routeProvenanceIdSchema.parse(routeProvenanceId)
    const row = this.db.prepare(`SELECT * FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(id) as RouteRow | undefined
    return row ? mapRoute(row) : null
  }

  listChoices(routeProvenanceId: unknown): CompatibleRouteChoice[] {
    const id = routeProvenanceIdSchema.parse(routeProvenanceId)
    const rows = this.db.prepare(`
      SELECT * FROM compatible_route_choices WHERE route_provenance_id = ? ORDER BY choice_index
    `).all(id) as Array<{ route_provenance_id: string; choice_index: number; message_id: string; created_at_ms: number }>
    return rows.map((row) => ({
      routeProvenanceId: routeProvenanceIdSchema.parse(row.route_provenance_id),
      choiceIndex: row.choice_index,
      messageId: row.message_id,
      createdAtMs: row.created_at_ms,
    }))
  }

  getRouteByRequestMessageId(messageId: unknown): CompatibleRouteProvenance | null {
    const id = compatibleMessageIdSchema.parse(messageId)
    const row = this.db.prepare(`
      SELECT * FROM compatible_route_provenance WHERE request_message_id = ?
      ORDER BY created_at_ms DESC, route_provenance_id DESC
      LIMIT 1
    `).get(id) as RouteRow | undefined
    return row ? mapRoute(row) : null
  }

  getRouteByChoiceMessageId(messageId: unknown): CompatibleRouteProvenance | null {
    const id = compatibleMessageIdSchema.parse(messageId)
    const row = this.db.prepare(`
      SELECT route.*
      FROM compatible_route_choices choice_record
      JOIN compatible_route_provenance route
        ON route.route_provenance_id = choice_record.route_provenance_id
      WHERE choice_record.message_id = ?
    `).get(id) as RouteRow | undefined
    return row ? mapRoute(row) : null
  }

  getAvailability(routeProvenanceId: unknown): CompatibleRouteAvailability | null {
    const id = routeProvenanceIdSchema.parse(routeProvenanceId)
    const row = this.db.prepare(`
      SELECT provider.status AS provider_status,
             route.credential_version_ref AS credential_version_ref,
             credential.deleted_at_ms AS credential_deleted_at_ms
      FROM compatible_route_provenance route
      JOIN compatible_provider_instances provider
        ON provider.provider_instance_id = route.provider_instance_id
      LEFT JOIN compatible_credential_descriptors credential
        ON credential.credential_version_ref = route.credential_version_ref
       AND credential.provider_instance_id = route.provider_instance_id
      WHERE route.route_provenance_id = ?
    `).get(id) as {
      provider_status: 'active' | 'disabled' | 'deleted'
      credential_version_ref: string | null
      credential_deleted_at_ms: number | null
    } | undefined
    if (!row) return null
    if (row.provider_status === 'disabled') return { available: false, code: 'provider_disabled' }
    if (row.provider_status === 'deleted') return { available: false, code: 'provider_deleted' }
    if (row.credential_version_ref && row.credential_deleted_at_ms === null) {
      const descriptor = this.db.prepare(`
        SELECT 1 AS present FROM compatible_credential_descriptors
        WHERE credential_version_ref = ?
      `).get(row.credential_version_ref) as { present: 1 } | undefined
      if (!descriptor) return { available: false, code: 'credential_missing' }
    }
    if (row.credential_version_ref && row.credential_deleted_at_ms !== null) {
      return { available: false, code: 'credential_deleted' }
    }
    return { available: true, code: 'ready' }
  }

  transition(input: unknown): CompatibleRouteProvenance {
    const value = compatibleRouteTransitionSchema.parse(input)
    const current = this.getRoute(value.routeProvenanceId)
    if (!current) throw new Error('Compatible route provenance is unavailable.')
    if (current.state === value.targetState) return current
    if (current.terminalAtMs !== null) throw new Error('Compatible route is already terminal.')
    if (value.atMs < current.updatedAtMs) throw new Error('Compatible route transition time must be monotonic.')
    const allowed = current.state === 'prepared'
      ? value.targetState === 'streaming' || value.targetState === 'aborted' || value.targetState === 'interrupted'
      : current.state === 'streaming' && ['completed', 'failed', 'aborted', 'interrupted'].includes(value.targetState)
    if (!allowed) throw new Error('Invalid compatible route state transition.')
    const terminalAtMs = value.targetState === 'streaming' ? null : value.atMs
    this.db.prepare(`
      UPDATE compatible_route_provenance
      SET state = @targetState, updated_at_ms = @atMs, terminal_at_ms = @terminalAtMs
      WHERE route_provenance_id = @routeProvenanceId
    `).run({ ...value, terminalAtMs })
    return this.getRoute(value.routeProvenanceId)!
  }

  recoverIncomplete(atMs: unknown): number {
    const requestedAtMs = timestampSchema.parse(atMs)
    const result = this.db.prepare(`
      UPDATE compatible_route_provenance
      SET state = 'interrupted',
          updated_at_ms = MAX(updated_at_ms, @atMs),
          terminal_at_ms = MAX(updated_at_ms, @atMs)
      WHERE state IN ('prepared', 'streaming')
    `).run({ atMs: requestedAtMs })
    return result.changes
  }

}
