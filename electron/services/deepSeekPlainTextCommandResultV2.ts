import type { GenerationReplayProjectionV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import type { GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import type { GenerationRequestRepositoryFactV2 } from '../../infra/db/repo/generationRequestV2Repo'
import type { PreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'

export type DeepSeekPlainTextCommandResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: GenerationExecutionOperationBundleV2
  projection: GenerationReplayProjectionV2
  preparedRequest: PreparedProviderRequestV2
  request: GenerationRequestRepositoryFactV2
}>

const results = new WeakSet<object>()

export function issueDeepSeekPlainTextCommandResultV2(
  value: DeepSeekPlainTextCommandResultV2,
): DeepSeekPlainTextCommandResultV2 {
  const result = Object.freeze(value)
  results.add(result)
  return result
}

export function isDeepSeekPlainTextCommandResultV2(
  value: unknown,
): value is DeepSeekPlainTextCommandResultV2 {
  return Boolean(value && typeof value === 'object' && results.has(value))
}
