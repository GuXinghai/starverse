import type BetterSqlite3 from 'better-sqlite3'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CapabilityRuleMaterializationV1Service } from '../../infra/db/services/capabilityRuleMaterializationV1Service'
import { buildCapabilityRuleSourceScopeIdV1 } from '../../src/next/generation-v2/model-facts/sourceScopeV1'
import type { CapabilityRuleDefaultActivationPoliciesV1 } from '../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'

export const CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1 = 'epoch-2-capability-rules' as const
export const CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1:
  CapabilityRuleDefaultActivationPoliciesV1 = Object.freeze({ cloud: 'enabled', user: 'enabled' })

const STALE_RACE_CODES = new Set([
  'GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE',
  'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE',
  'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STALE_CURRENT',
])
const MAX_STALE_RACE_RETRIES = 3

type MaterializationActivator = Readonly<{
  activateCurrent: (
    input: Parameters<CapabilityRuleMaterializationV1Service['activateCurrent']>[0],
  ) => Promise<unknown>
}>

type SchedulerInput = Readonly<{
  db: BetterSqlite3.Database
  materializationService: MaterializationActivator
  nowMs?: () => number
  readActiveSourceRevision?: () => string | null
  logFailure?: (details: Readonly<{ code: string; attempts: number }>) => void
}>

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error &&
      typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  if (error instanceof Error && error.message) return error.message
  return 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_FAILED'
}

function isStaleRace(error: unknown): boolean {
  return STALE_RACE_CODES.has(errorCode(error))
}

/**
 * Process-level, best-effort activation orchestration for the materialized Capability Rules source.
 * Preparation is delegated to CapabilityRuleMaterializationV1Service; this class only serializes
 * requests, coalesces notifications, and retries its explicitly stale revision/CAS races.
 */
export class CapabilityRuleMaterializationSchedulerV1Service {
  readonly #materializationService: MaterializationActivator
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  readonly #sourceScopeId = buildCapabilityRuleSourceScopeIdV1({
    ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
  })
  readonly #readActiveSourceRevision: () => string | null
  readonly #nowMs: () => number
  readonly #logFailure: (details: Readonly<{ code: string; attempts: number }>) => void
  #requested = false
  #drainPromise: Promise<void> | null = null

  constructor(input: SchedulerInput) {
    this.#materializationService = input.materializationService
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(input.db)
    this.#readActiveSourceRevision = input.readActiveSourceRevision ?? (() =>
      this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)?.currentSourceRevision ?? null)
    this.#nowMs = input.nowMs ?? Date.now
    this.#logFailure = input.logFailure ?? ((details) => {
      console.error('[generation-v2][capability-rules] materialization failed', details)
    })
  }

  /** Schedule one or, if a notification arrives while running, one coalesced follow-up run. */
  schedule(): Promise<void> {
    this.#requested = true
    if (!this.#drainPromise) {
      const drainPromise = this.#drain()
      this.#drainPromise = drainPromise.then(
        () => this.#finishDrain(),
        (error) => {
          // A failure belongs to the run observed by the current awaiters. Re-arm any
          // request that arrived while that run was in flight without hiding the failure.
          this.#finishDrain(true)
          throw error
        },
      )
    }
    return this.#drainPromise
  }

  #finishDrain(failed = false): Promise<void> | undefined {
    this.#drainPromise = null
    // A notification can land after #drain observes an empty queue but before this
    // completion handler runs. Re-arm the drain so that request cannot be stranded.
    if (!this.#requested) return undefined
    const followUp = this.schedule()
    if (failed) void followUp.catch(() => undefined)
    return followUp
  }

  async #drain(): Promise<void> {
    while (this.#requested) {
      this.#requested = false
      await this.#runOnce()
    }
  }

  async #runOnce(): Promise<void> {
    for (let retry = 0; retry <= MAX_STALE_RACE_RETRIES; retry += 1) {
      try {
        // This read intentionally happens for every attempt, including stale retries. The CAS
        // expected value must describe the active source at the start of that attempt.
        const expectedActiveSourceRevision = this.#readActiveSourceRevision()
        const attemptedAtMs = this.#nowMs()
        await this.#materializationService.activateCurrent({
          ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
          defaultActivationPolicies: CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1,
          expectedActiveSourceRevision,
          fetchedAtMs: attemptedAtMs,
          lastAttemptedAtMs: attemptedAtMs,
        })
        return
      } catch (error) {
        if (isStaleRace(error)) {
          if (retry < MAX_STALE_RACE_RETRIES) continue
          this.#logFailure({ code: errorCode(error), attempts: retry + 1 })
          throw error
        }
        this.#logFailure({ code: errorCode(error), attempts: retry + 1 })
        throw error
      }
    }
  }
}
