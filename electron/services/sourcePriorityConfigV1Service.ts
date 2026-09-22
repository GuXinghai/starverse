import type BetterSqlite3 from 'better-sqlite3'
import {
  SourcePriorityConfigV1Repo,
  type SourcePriorityConfigRepositoryFactV1,
} from '../../infra/db/repo/sourcePriorityConfigV1Repo'

export class SourcePriorityConfigV1Service {
  readonly #repo: SourcePriorityConfigV1Repo

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#repo = new SourcePriorityConfigV1Repo(db, nowMs)
  }

  read(): SourcePriorityConfigRepositoryFactV1 {
    return this.#repo.get()
  }

  update(input: Readonly<{ expectedConfigRevision: string; priorities: unknown }>): SourcePriorityConfigRepositoryFactV1 {
    return this.#repo.compareAndSet(input.expectedConfigRevision, input.priorities)
  }
}
