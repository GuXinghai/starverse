import type { RuntimeProviderId } from '../provider/runtimeProviderId'

export type ModelRecentUsageRef = Readonly<{
  providerId: RuntimeProviderId
  modelId: string
}>

type GenerationCommandAcceptance = Readonly<{
  ok: boolean
  kind?: string
}>

export function modelRecentUsageForCreatedOperation(
  result: GenerationCommandAcceptance,
  ref: ModelRecentUsageRef | null,
): ModelRecentUsageRef | null {
  if (!result.ok || result.kind !== 'created' || !ref) return null
  const modelId = ref.modelId.trim()
  if (!modelId) return null
  return { providerId: ref.providerId, modelId }
}
