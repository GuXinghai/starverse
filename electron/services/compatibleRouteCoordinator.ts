import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import { BeginTurnSchema } from '../../infra/db/validation'
import {
  compatibleHistoricalRouteLookupSchema,
  compatibleHistoricalRouteResultSchema,
  compatiblePreparedTurnResultSchema,
  compatibleRoutePinSourceSchema,
  compatibleRouteSelectedPinsSchema,
  compatibleRouteSelectionSchema,
  compatibleRoutePrepareExistingHistoricalSchema,
  compatibleRouteTransitionSchema,
  formatCompatibleOpaqueId,
  type CompatibleHistoricalRouteLookup,
  type CompatibleHistoricalRouteResult,
  type CompatiblePreparedTurnResult,
  type CredentialVersionRef,
} from '../../src/shared/provider/openai-chat-compatible'
import type { CompatibleCredentialService } from '../credentials/compatibleCredentialService'

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

const prepareCommandSchema = z.object({
  selection: compatibleRouteSelectedPinsSchema,
  turn: z.unknown(),
}).strict()

export type CompatibleRoutePrepareOutcome =
  | Readonly<{ ok: true; value: CompatiblePreparedTurnResult }>
  | Readonly<{
      ok: false
      code: 'route_missing' | 'provider_disabled' | 'provider_deleted' | 'credential_missing' | 'credential_deleted'
      value?: CompatiblePreparedTurnResult
    }>

export type CompatibleHistoricalRouteOutcome =
  | Readonly<{ ok: true; value: CompatibleHistoricalRouteResult }>
  | Readonly<{
      ok: false
      code: 'route_missing' | 'provider_disabled' | 'provider_deleted' | 'credential_missing' | 'credential_deleted'
      value?: CompatibleHistoricalRouteResult
    }>

export type CompatibleRouteCoordinator = Readonly<{
  prepareTurn: (raw: unknown) => Promise<CompatibleRoutePrepareOutcome>
  prepareHistoricalTurn: (raw: unknown) => Promise<CompatibleRoutePrepareOutcome>
  prepareExistingHistoricalTurn: (raw: unknown) => Promise<CompatibleRoutePrepareOutcome>
  usePreparedTurn: (raw: unknown) => Promise<CompatibleRoutePrepareOutcome>
  resolveHistorical: (raw: CompatibleHistoricalRouteLookup) => Promise<CompatibleHistoricalRouteOutcome>
  transition: (raw: unknown) => Promise<CompatiblePreparedTurnResult['route']>
}>

export function createCompatibleRouteCoordinator(input: Readonly<{
  db: DbCaller
  credentials: CompatibleCredentialService
  nowMs?: () => number
}>): CompatibleRouteCoordinator {
  const nowMs = input.nowMs ?? Date.now

  async function transition(raw: unknown): Promise<CompatiblePreparedTurnResult['route']> {
    const command = compatibleRouteTransitionSchema.parse(raw)
    const result = await input.db.call('compatibleRoute.transition', command)
    return compatiblePreparedTurnResultSchema.shape.route.parse(result)
  }

  async function prepareTurn(raw: unknown): Promise<CompatibleRoutePrepareOutcome> {
    const command = prepareCommandSchema.parse(raw)
    return prepareWithPins(
      { providerInstanceId: command.selection.providerInstanceId, modelId: command.selection.modelId },
      { kind: 'selected', pins: command.selection },
      BeginTurnSchema.parse(command.turn),
    )
  }

  async function prepareWithPins(
    selection: z.infer<typeof compatibleRouteSelectionSchema>,
    pinSource: z.infer<typeof compatibleRoutePinSourceSchema>,
    turn: z.infer<typeof BeginTurnSchema>,
  ): Promise<CompatibleRoutePrepareOutcome> {
    const createdAtMs = nowMs()
    const routeProvenanceId = formatCompatibleOpaqueId('route', randomUUID())
    const result = compatiblePreparedTurnResultSchema.parse(await input.db.call('compatibleRoute.prepareTurn', {
      route: {
        routeProvenanceId,
        requestId: `ocp_request_${randomUUID()}`,
        ...selection,
        createdAtMs,
      },
      pinSource,
      turn,
    }))
    if (!result.availability.available) {
      if (result.availability.code === 'ready') throw new Error('Compatible route availability is inconsistent.')
      const interrupted = await transition({ routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: result.availability.code, value: { ...result, route: interrupted } }
    }
    const ref = result.route.credentialVersionRef
    if (ref && !input.credentials.has(ref as CredentialVersionRef)) {
      const interrupted = await transition({ routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: 'credential_missing', value: { ...result, route: interrupted } }
    }
    return { ok: true, value: result }
  }

  async function prepareHistoricalTurn(raw: unknown): Promise<CompatibleRoutePrepareOutcome> {
    const command = z.object({
      source: compatibleHistoricalRouteLookupSchema,
      turn: z.unknown(),
    }).strict().parse(raw)
    const resolved = compatibleHistoricalRouteResultSchema.nullable().parse(
      await input.db.call('compatibleRoute.resolveHistorical', command.source),
    )
    if (!resolved) return { ok: false, code: 'route_missing' }
    return prepareWithPins(
      { providerInstanceId: resolved.route.providerInstanceId, modelId: resolved.route.modelId },
      { kind: 'historical', routeProvenanceId: resolved.route.routeProvenanceId },
      BeginTurnSchema.parse(command.turn),
    )
  }

  async function prepareExistingHistoricalTurn(raw: unknown): Promise<CompatibleRoutePrepareOutcome> {
    const command = compatibleRoutePrepareExistingHistoricalSchema.omit({ route: true }).parse(raw)
    const result = compatiblePreparedTurnResultSchema.parse(await input.db.call('compatibleRoute.prepareExistingHistorical', {
      ...command,
      route: {
        routeProvenanceId: formatCompatibleOpaqueId('route', randomUUID()),
        requestId: `ocp_request_${randomUUID()}`,
        createdAtMs: nowMs(),
      },
    }))
    if (!result.availability.available) {
      if (result.availability.code === 'ready') throw new Error('Compatible route availability is inconsistent.')
      const interrupted = await transition({ routeProvenanceId: result.route.routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: result.availability.code, value: { ...result, route: interrupted } }
    }
    const ref = result.route.credentialVersionRef
    if (ref && !input.credentials.has(ref as CredentialVersionRef)) {
      const interrupted = await transition({ routeProvenanceId: result.route.routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: 'credential_missing', value: { ...result, route: interrupted } }
    }
    return { ok: true, value: result }
  }

  async function usePreparedTurn(raw: unknown): Promise<CompatibleRoutePrepareOutcome> {
    const command = z.object({
      routeProvenanceId: z.string().startsWith('ocp_route_').max(106),
      branchId: z.string().min(1), questionId: z.string().min(1), assistantId: z.string().min(1),
    }).strict().parse(raw)
    const result = compatiblePreparedTurnResultSchema.parse(await input.db.call('compatibleRoute.getPreparedTurn', command))
    if (!result.availability.available) {
      if (result.availability.code === 'ready') throw new Error('Compatible route availability is inconsistent.')
      const interrupted = await transition({ routeProvenanceId: result.route.routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: result.availability.code, value: { ...result, route: interrupted } }
    }
    const ref = result.route.credentialVersionRef
    if (ref && !input.credentials.has(ref as CredentialVersionRef)) {
      const interrupted = await transition({ routeProvenanceId: result.route.routeProvenanceId, targetState: 'interrupted', atMs: nowMs() })
      return { ok: false, code: 'credential_missing', value: { ...result, route: interrupted } }
    }
    return { ok: true, value: result }
  }

  async function resolveHistorical(raw: CompatibleHistoricalRouteLookup): Promise<CompatibleHistoricalRouteOutcome> {
    const lookup = compatibleHistoricalRouteLookupSchema.parse(raw)
    const result = compatibleHistoricalRouteResultSchema.nullable().parse(
      await input.db.call('compatibleRoute.resolveHistorical', lookup),
    )
    if (!result) return { ok: false, code: 'route_missing' }
    if (!result.availability.available) {
      if (result.availability.code === 'ready') throw new Error('Compatible route availability is inconsistent.')
      return { ok: false, code: result.availability.code, value: result }
    }
    const ref = result.route.credentialVersionRef
    if (ref && !input.credentials.has(ref as CredentialVersionRef)) {
      return { ok: false, code: 'credential_missing', value: result }
    }
    return { ok: true, value: result }
  }

  return { prepareTurn, prepareHistoricalTurn, prepareExistingHistoricalTurn, usePreparedTurn, resolveHistorical, transition }
}
