import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  compatibleChoiceIndexSchema,
  compatibleDiscoveredFieldAggregateSchema,
  compatibleMessageIdSchema,
  compatibleProfileVersionSchema,
  compatibleRawExtensionValueSchema,
  providerInstanceIdSchema,
  rawExtensionRecordIdSchema,
  responseProfileIdSchema,
  routeProvenanceIdSchema,
  type CompatibleDiscoveredResponseField,
  type CompatibleRawExtensionRecord,
} from '../../../src/shared/provider/openai-chat-compatible'

export const COMPATIBLE_RAW_RECORDS_PER_RESPONSE_MAX = 256
export const COMPATIBLE_RAW_BYTES_PER_RESPONSE_MAX = 256 * 1024
export const COMPATIBLE_DISCOVERY_CANDIDATES_PER_PROFILE_MAX = 128

const timestampSchema = z.number().int().nonnegative()
const sequenceSchema = z.number().int().nonnegative()

export const UpsertCompatibleDiscoveredFieldInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  responseProfileId: responseProfileIdSchema,
  profileVersion: compatibleProfileVersionSchema,
  streamPath: z.string().trim().min(1).max(1024),
  state: z.enum(['candidate', 'ignored', 'confirmed']),
  aggregate: compatibleDiscoveredFieldAggregateSchema,
  occurrenceCount: z.number().int().positive().max(1_000_000_000),
  firstObservedAtMs: timestampSchema,
  lastObservedAtMs: timestampSchema,
}).strict().refine((value) => value.lastObservedAtMs >= value.firstObservedAtMs, {
  path: ['lastObservedAtMs'],
  message: 'Last observation precedes the first observation.',
})

export const CreateCompatibleRawExtensionRecordInputSchema = z.object({
  recordId: rawExtensionRecordIdSchema,
  routeProvenanceId: routeProvenanceIdSchema,
  messageId: compatibleMessageIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: compatibleProfileVersionSchema,
  sourcePath: z.string().trim().min(1).max(1024),
  sequenceStart: sequenceSchema,
  sequenceEnd: sequenceSchema,
  extensionKind: z.enum(['append', 'snapshot']).default('snapshot'),
  semantic: z.enum(['reasoning', 'diagnostic']).default('diagnostic'),
  value: compatibleRawExtensionValueSchema,
  redactionState: z.enum(['redacted', 'truncated_redacted', 'dropped']),
  createdAtMs: timestampSchema,
}).strict().refine((value) => value.sequenceEnd >= value.sequenceStart, {
  path: ['sequenceEnd'],
  message: 'Raw extension sequence end precedes its start.',
})

export type UpsertCompatibleDiscoveredFieldInput = z.input<typeof UpsertCompatibleDiscoveredFieldInputSchema>
export type CreateCompatibleRawExtensionRecordInput = z.input<typeof CreateCompatibleRawExtensionRecordInputSchema>

export class CompatibleDiagnosticsRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  upsertDiscoveredField(input: UpsertCompatibleDiscoveredFieldInput): CompatibleDiscoveredResponseField {
    const value = UpsertCompatibleDiscoveredFieldInputSchema.parse(input)
    const existing = this.getDiscoveredField(value.providerInstanceId, value.responseProfileId, value.profileVersion, value.streamPath)
    if (existing && existing.state !== 'candidate' && value.state === 'candidate') {
      throw new Error('Discovered-field state cannot regress to candidate.')
    }
    if (existing && value.occurrenceCount < existing.occurrenceCount) {
      throw new Error('Discovered-field occurrence count cannot decrease.')
    }
    if (!existing) {
      const count = this.db.prepare(`
        SELECT COUNT(*) AS count FROM compatible_discovered_fields
        WHERE provider_instance_id = ? AND response_profile_id = ? AND profile_version = ?
      `).get(value.providerInstanceId, value.responseProfileId, value.profileVersion) as { count: number }
      if (count.count >= COMPATIBLE_DISCOVERY_CANDIDATES_PER_PROFILE_MAX) {
        throw new Error('Discovered-field candidate limit exceeded for this profile version.')
      }
    }
    this.db.prepare(`
      INSERT INTO compatible_discovered_fields (
        provider_instance_id, response_profile_id, profile_version, stream_path,
        state, aggregate_json, occurrence_count, first_observed_at_ms, last_observed_at_ms
      ) VALUES (
        @providerInstanceId, @responseProfileId, @profileVersion, @streamPath,
        @state, @aggregateJson, @occurrenceCount, @firstObservedAtMs, @lastObservedAtMs
      )
      ON CONFLICT(provider_instance_id, response_profile_id, profile_version, stream_path) DO UPDATE SET
        state = excluded.state,
        aggregate_json = excluded.aggregate_json,
        occurrence_count = excluded.occurrence_count,
        first_observed_at_ms = MIN(compatible_discovered_fields.first_observed_at_ms, excluded.first_observed_at_ms),
        last_observed_at_ms = MAX(compatible_discovered_fields.last_observed_at_ms, excluded.last_observed_at_ms)
    `).run({ ...value, aggregateJson: JSON.stringify(value.aggregate) })
    return this.getDiscoveredField(value.providerInstanceId, value.responseProfileId, value.profileVersion, value.streamPath)!
  }

  getDiscoveredField(
    providerInstanceId: unknown,
    responseProfileId: unknown,
    profileVersion: unknown,
    streamPath: unknown,
  ): CompatibleDiscoveredResponseField | null {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const profileId = responseProfileIdSchema.parse(responseProfileId)
    const version = compatibleProfileVersionSchema.parse(profileVersion)
    const path = z.string().trim().min(1).max(1024).parse(streamPath)
    const row = this.db.prepare(`
      SELECT * FROM compatible_discovered_fields
      WHERE provider_instance_id = ? AND response_profile_id = ? AND profile_version = ? AND stream_path = ?
    `).get(providerId, profileId, version, path) as {
      provider_instance_id: string
      response_profile_id: string
      profile_version: number
      stream_path: string
      state: CompatibleDiscoveredResponseField['state']
      aggregate_json: string
      occurrence_count: number
      first_observed_at_ms: number
      last_observed_at_ms: number
    } | undefined
    return row ? {
      providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
      responseProfileId: responseProfileIdSchema.parse(row.response_profile_id),
      profileVersion: row.profile_version,
      streamPath: row.stream_path,
      state: row.state,
      aggregate: compatibleDiscoveredFieldAggregateSchema.parse(JSON.parse(row.aggregate_json)),
      occurrenceCount: row.occurrence_count,
      firstObservedAtMs: row.first_observed_at_ms,
      lastObservedAtMs: row.last_observed_at_ms,
    } : null
  }

  listDiscoveredFields(input: unknown): CompatibleDiscoveredResponseField[] {
    const value = z.object({
      providerInstanceId: providerInstanceIdSchema,
      responseProfileId: responseProfileIdSchema,
      profileVersion: compatibleProfileVersionSchema,
      state: z.enum(['candidate', 'ignored', 'confirmed']).optional(),
      limit: z.number().int().positive().max(COMPATIBLE_DISCOVERY_CANDIDATES_PER_PROFILE_MAX).default(128),
    }).strict().parse(input)
    const rows = this.db.prepare(`
      SELECT stream_path FROM compatible_discovered_fields
      WHERE provider_instance_id = ? AND response_profile_id = ? AND profile_version = ?
        AND (? IS NULL OR state = ?)
      ORDER BY last_observed_at_ms DESC, stream_path
      LIMIT ?
    `).all(value.providerInstanceId, value.responseProfileId, value.profileVersion, value.state ?? null, value.state ?? null, value.limit) as Array<{ stream_path: string }>
    return rows.map((row) => this.getDiscoveredField(value.providerInstanceId, value.responseProfileId, value.profileVersion, row.stream_path)!)
  }

  setDiscoveredFieldState(input: unknown): CompatibleDiscoveredResponseField {
    const value = z.object({
      providerInstanceId: providerInstanceIdSchema,
      responseProfileId: responseProfileIdSchema,
      profileVersion: compatibleProfileVersionSchema,
      streamPath: z.string().trim().min(1).max(1024),
      state: z.enum(['ignored', 'confirmed']),
    }).strict().parse(input)
    const current = this.getDiscoveredField(value.providerInstanceId, value.responseProfileId, value.profileVersion, value.streamPath)
    if (!current) throw new Error('Compatible discovered field is unavailable.')
    return this.upsertDiscoveredField({ ...current, state: value.state })
  }

  createRawExtensionRecord(input: CreateCompatibleRawExtensionRecordInput): CompatibleRawExtensionRecord {
    const value = CreateCompatibleRawExtensionRecordInputSchema.parse(input)
    const valueJson = JSON.stringify(value.value)
    const valueBytes = new TextEncoder().encode(valueJson).byteLength
    const insert = this.db.transaction(() => {
      const route = this.db.prepare(`
        SELECT response_profile_id, response_profile_version FROM compatible_route_provenance
        WHERE route_provenance_id = ?
      `).get(value.routeProvenanceId) as { response_profile_id: string; response_profile_version: number } | undefined
      if (!route || route.response_profile_id !== value.responseProfileId || route.response_profile_version !== value.responseProfileVersion) {
        throw new Error('Raw extension profile must match immutable route provenance.')
      }
      const totals = this.db.prepare(`
        SELECT COUNT(*) AS record_count, COALESCE(SUM(value_bytes), 0) AS total_bytes
        FROM compatible_raw_extension_records WHERE route_provenance_id = ?
      `).get(value.routeProvenanceId) as { record_count: number; total_bytes: number }
      if (totals.record_count >= COMPATIBLE_RAW_RECORDS_PER_RESPONSE_MAX) {
        throw new Error('Raw extension record count limit exceeded for this response.')
      }
      if (totals.total_bytes + valueBytes > COMPATIBLE_RAW_BYTES_PER_RESPONSE_MAX) {
        throw new Error('Raw extension byte limit exceeded for this response.')
      }
      this.db.prepare(`
      INSERT INTO compatible_raw_extension_records (
        record_id, route_provenance_id, message_id, choice_index,
        response_profile_id, response_profile_version, source_path,
        sequence_start, sequence_end, extension_kind, semantic, value_json, value_bytes,
        redaction_state, created_at_ms
      ) VALUES (
        @recordId, @routeProvenanceId, @messageId, @choiceIndex,
        @responseProfileId, @responseProfileVersion, @sourcePath,
        @sequenceStart, @sequenceEnd, @extensionKind, @semantic, @valueJson, @valueBytes,
        @redactionState, @createdAtMs
      )
      `).run({ ...value, valueJson, valueBytes })
    })
    insert()
    return this.listRawExtensionRecords(value.messageId).find((record) => record.recordId === value.recordId)!
  }

  createRawExtensionRecords(inputs: readonly CreateCompatibleRawExtensionRecordInput[]): CompatibleRawExtensionRecord[] {
    const values = z.array(CreateCompatibleRawExtensionRecordInputSchema).max(COMPATIBLE_RAW_RECORDS_PER_RESPONSE_MAX).parse(inputs)
    if (values.length === 0) return []
    const routeId = values[0]!.routeProvenanceId
    if (values.some((value) => value.routeProvenanceId !== routeId)) {
      throw new Error('Raw extension batch must belong to one response route.')
    }
    return this.db.transaction(() => values.map((value) => this.createRawExtensionRecord(value)))()
  }

  listRawExtensionRecords(messageId: unknown): CompatibleRawExtensionRecord[] {
    const id = compatibleMessageIdSchema.parse(messageId)
    const rows = this.db.prepare(`
      SELECT * FROM compatible_raw_extension_records
      WHERE message_id = ? ORDER BY choice_index, sequence_start, record_id
    `).all(id) as Array<{
      record_id: string
      route_provenance_id: string
      message_id: string
      choice_index: number
      response_profile_id: string
      response_profile_version: number
      source_path: string
      sequence_start: number
      sequence_end: number
      extension_kind: CompatibleRawExtensionRecord['extensionKind']
      semantic: CompatibleRawExtensionRecord['semantic']
      value_json: string
      value_bytes: number
      redaction_state: CompatibleRawExtensionRecord['redactionState']
      created_at_ms: number
    }>
    return rows.map((row) => ({
      recordId: rawExtensionRecordIdSchema.parse(row.record_id),
      routeProvenanceId: routeProvenanceIdSchema.parse(row.route_provenance_id),
      messageId: row.message_id,
      choiceIndex: row.choice_index,
      responseProfileId: responseProfileIdSchema.parse(row.response_profile_id),
      responseProfileVersion: row.response_profile_version,
      sourcePath: row.source_path,
      sequenceStart: row.sequence_start,
      sequenceEnd: row.sequence_end,
      extensionKind: row.extension_kind,
      semantic: row.semantic,
      value: compatibleRawExtensionValueSchema.parse(JSON.parse(row.value_json)),
      valueBytes: row.value_bytes,
      redactionState: row.redaction_state,
      createdAtMs: row.created_at_ms,
    }))
  }

  purgeExpiredRawExtensionRecords(input: unknown): Readonly<{ deleted: number; recordIds: readonly string[] }> {
    const value = z.object({ beforeMs: timestampSchema, limit: z.number().int().positive().max(10_000).default(1000) }).strict().parse(input)
    const transaction = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT record.record_id
        FROM compatible_raw_extension_records record
        JOIN compatible_route_provenance route ON route.route_provenance_id = record.route_provenance_id
        WHERE record.created_at_ms < ? AND route.state IN ('completed', 'failed', 'aborted', 'interrupted')
          AND NOT EXISTS (
            SELECT 1
            FROM compatible_choice_display_projections projection, json_each(projection.projection_json, '$.rawExtensionRecordIds') reference
            WHERE projection.route_provenance_id = record.route_provenance_id AND reference.value = record.record_id
          )
        ORDER BY record.created_at_ms, record.record_id
        LIMIT ?
      `).all(value.beforeMs, value.limit) as Array<{ record_id: string }>
      const remove = this.db.prepare(`DELETE FROM compatible_raw_extension_records WHERE record_id = ?`)
      for (const row of rows) remove.run(row.record_id)
      return Object.freeze({ deleted: rows.length, recordIds: Object.freeze(rows.map((row) => row.record_id)) })
    })
    return transaction()
  }
}
