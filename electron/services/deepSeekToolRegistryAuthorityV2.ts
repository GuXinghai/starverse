import type { GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  ToolRegistryV2Repo,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import type { GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'

export function resolveDeepSeekToolRegistryAuthorityV2(
  context: GenerationV2AuthorityTransactionContextV2,
  repo: ToolRegistryV2Repo,
  commandFacts: GenerationCommandFactsAuthorityV2,
): ToolRegistryRepositoryFactV2 | null {
  if (commandFacts.semanticIntent.tools.mode === 'disabled') return null
  return repo.resolveCurrentForTools(
    context,
    commandFacts.semanticIntent.tools.allowedToolIds.map((toolId) => toolId.value),
  )
}

export function loadDeepSeekSnapshotToolRegistryAuthorityV2(
  context: GenerationV2AuthorityTransactionContextV2,
  repo: ToolRegistryV2Repo,
  execution: GenerationExecutionOperationBundleV2,
): ToolRegistryRepositoryFactV2 | null {
  const tools = execution.snapshot.semanticIntent.tools
  if (tools.mode === 'disabled') return null
  if (execution.snapshot.toolAuthority.kind !== 'registry') {
    throw new Error('GENERATION_V2_DEEPSEEK_TOOL_REGISTRY_AUTHORITY_REQUIRED')
  }
  return repo.loadSnapshotAuthority(
    context,
    execution.snapshot.toolAuthority.toolRegistryRevision.value,
    execution.snapshot.toolAuthority.toolDefinitionsDigest.value,
    tools.allowedToolIds.map((toolId) => toolId.value),
  )
}
