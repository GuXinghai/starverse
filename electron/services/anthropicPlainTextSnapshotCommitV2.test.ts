import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { decodeAnthropicPlainTextInitialSendCommandV2 } from '../../src/next/generation-v2/providers/anthropic/plainTextInitialSendCommandV2'
import { commitVerifiedAnthropicPlainTextInitialSnapshotV2 } from './anthropicPlainTextSnapshotCommitV2'

describe('Anthropic plain-text snapshot commit V2', () => {
  it('rejects unbranded transaction, pending turn and authorities before persistence', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      applyGenerationV2SchemaForTest(db, process.cwd())
      const command = decodeAnthropicPlainTextInitialSendCommandV2({
        operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
        userBody: 'hello', modelId: 'claude-opus-4-6', commandAttachments: [],
      })
      expect(() => commitVerifiedAnthropicPlainTextInitialSnapshotV2({
        context: {} as never,
        executionRepo: new GenerationExecutionV2Repo(db),
        capabilityRepo: new RuntimeCapabilityV2Repo(db),
        pending: {} as never,
        command,
        commandFacts: {} as never,
        binding: {} as never,
        capability: {} as never,
      })).toThrow('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID')
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })
})
