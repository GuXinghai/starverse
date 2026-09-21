import type BetterSqlite3 from 'better-sqlite3'
import type { AuthoritativeModelSubjectSetV1 } from '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalizeRawPayloadRefV1,
  type CanonicalFieldOutcomeV1,
  type CanonicalModelSubjectV1,
  type CanonicalSemanticPathV1,
  type RawPayloadRefV1,
} from '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  CanonicalModelFactSourceV1Repo,
  type CanonicalModelFactSourceStateV1,
  type CanonicalModelFactSubjectPublicationV1,
} from '../../infra/db/repo/canonicalModelFactSourceV1Repo'

type AuthoritativeSubjectSetReader = Readonly<{ readCurrent: () => Promise<AuthoritativeModelSubjectSetV1> }>

export type ModelFactsInspectorReadAuthorityV1 = Readonly<{
  searchSubjects: (input: Readonly<{ query?: string; cursor?: string | null; limit: number }>) => Promise<ModelFactsInspectorSubjectPageV1>
  readInspectorSnapshot: (input: Readonly<{ subject: CanonicalModelSubjectV1; expectedSubjectSetRevision?: string }>) => Promise<unknown>
  readEvidenceSlice: (input: Readonly<{
    subject: CanonicalModelSubjectV1
    sourceKind: CanonicalModelFactSourceStateV1['sourceKind']
    sourceScopeId: string
    path: CanonicalSemanticPathV1
    expectedSubjectSetRevision?: string
  }>) => Promise<CanonicalFieldOutcomeV1 | null>
  readSanitizedRawPayload: (rawPayloadRef: RawPayloadRefV1) => unknown
}>

export type ModelFactsInspectorSubjectPageV1 = Readonly<{
  subjectSetRevision: string
  records: readonly AuthoritativeModelSubjectSetV1['records'][number][]
  nextCursor: string | null
}>

export type ModelFactsInspectorSourceRowV1 = Readonly<{
  state: CanonicalModelFactSourceStateV1
  subjectFact: CanonicalModelFactSubjectPublicationV1 | null
}>

function invalid(): never {
  throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_INVALID')
}

function subjectKey(subject: CanonicalModelSubjectV1): string {
  return `${subject.providerAuthorityId}\u0000${subject.endpointProfileId}\u0000${subject.nativeModelId}`
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) invalid()
  return value
}

function exactSubjectIn(set: AuthoritativeModelSubjectSetV1, subject: CanonicalModelSubjectV1): boolean {
  const key = subjectKey(subject)
  return set.records.some((record) => subjectKey(record.subject) === key)
}

/**
 * Read-only UI projection over persisted canonical source facts. It deliberately
 * returns one row per source state and never selects a winner or synthesizes a
 * resolved fact.
 */
export class ModelFactsInspectorV1Service {
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo

  constructor(db: BetterSqlite3.Database, private readonly subjectSets: AuthoritativeSubjectSetReader) {
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db)
  }

  async searchSubjects(input: Readonly<{ query?: string; cursor?: string | null; limit: number }>): Promise<ModelFactsInspectorSubjectPageV1> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200) invalid()
    const query = input.query === undefined ? '' : input.query.trim().toLocaleLowerCase('en-US')
    if (query.length > 512) invalid()
    const cursor = input.cursor === null || input.cursor === undefined ? null : boundedText(input.cursor, 4096)
    const set = await this.subjectSets.readCurrent()
    const records = set.records.filter((record) => {
      const searchable = `${record.subject.providerAuthorityId}\n${record.subject.endpointProfileId}\n${record.subject.nativeModelId}`
        .toLocaleLowerCase('en-US')
      return query === '' || searchable.includes(query)
    })
    const offset = cursor === null ? 0 : Number.parseInt(cursor, 10)
    if (!Number.isSafeInteger(offset) || offset < 0 || (cursor !== null && String(offset) !== cursor)) invalid()
    const page = records.slice(offset, offset + input.limit)
    const next = offset + page.length < records.length ? String(offset + page.length) : null
    return Object.freeze({ subjectSetRevision: set.subjectSetRevision, records: Object.freeze(page), nextCursor: next })
  }

  async readInspectorSnapshot(input: Readonly<{ subject: CanonicalModelSubjectV1; expectedSubjectSetRevision?: string }>): Promise<Readonly<{
    subjectSetRevision: string
    subject: CanonicalModelSubjectV1
    sources: readonly ModelFactsInspectorSourceRowV1[]
  }>> {
    const subject = canonicalizeCanonicalModelSubjectV1(input.subject)
    const set = await this.subjectSets.readCurrent()
    if (input.expectedSubjectSetRevision !== undefined && input.expectedSubjectSetRevision !== set.subjectSetRevision) {
      throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_STALE_SUBJECT_SET')
    }
    if (!exactSubjectIn(set, subject)) throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_SUBJECT_NOT_FOUND')
    const sources = this.#sourceRepo.listSourceStates().map((state) => Object.freeze({ state,
      subjectFact: state.currentSourceRevision === null ? null : this.#sourceRepo.readSubjectFact({
        canonicalSourceRevision: state.currentSourceRevision, subject,
      }) }))
    return Object.freeze({ subjectSetRevision: set.subjectSetRevision, subject, sources: Object.freeze(sources) })
  }

  async readEvidenceSlice(input: Readonly<{
    subject: CanonicalModelSubjectV1
    sourceKind: CanonicalModelFactSourceStateV1['sourceKind']
    sourceScopeId: string
    path: CanonicalSemanticPathV1
    expectedSubjectSetRevision?: string
  }>): Promise<CanonicalFieldOutcomeV1 | null> {
    const snapshot = await this.readInspectorSnapshot({ subject: input.subject,
      ...(input.expectedSubjectSetRevision === undefined ? {} : { expectedSubjectSetRevision: input.expectedSubjectSetRevision }) })
    const scope = boundedText(input.sourceScopeId, 1024)
    const row = snapshot.sources.find((source) => source.state.sourceKind === input.sourceKind &&
      source.state.sourceScopeId === scope)
    if (!row?.subjectFact) return null
    return row.subjectFact.payload.outcomes.find((outcome) => outcome.path === input.path) ?? null
  }

  readSanitizedRawPayload(rawPayloadRef: RawPayloadRefV1): unknown {
    return this.#sourceRepo.readRawPayload(canonicalizeRawPayloadRefV1(rawPayloadRef))
  }
}
