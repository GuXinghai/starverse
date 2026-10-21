import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import { rememberTargetImageV2 } from '@/core/generation-v2/config/targetImagePreferencesV2'
import { rememberTargetThinkingV2, selectTargetThinkingV2, type ThinkingTargetV2 } from '@/core/generation-v2/config/targetThinkingPreferencesV2'

/** Image edits must not promote UI projections of other controls into new user intent. */
export function patchImageGenerationSemanticV2(previous: Readonly<Record<string, unknown>>,
  image: Readonly<Record<string, unknown>>, binding: ThinkingTargetV2,
  previousBinding?: ThinkingTargetV2): Readonly<Record<string, unknown>> {
  const remembered = previousBinding ? rememberTargetThinkingV2(previous, previous, previousBinding) : previous
  const selected = selectTargetThinkingV2(remembered, binding)
  let providerExtension = selected.providerExtension
  const extensionKind = (providerExtension as { kind?: string } | undefined)?.kind
  // Image enablement can switch Gemini protocols. Restore that target's native
  // settings if present; otherwise initialize only its required protocol shape.
  if (binding.protocolContractId === 'gemini-interactions-v1beta' && extensionKind !== 'gemini_interactions') {
    providerExtension = { kind: 'gemini_interactions' }
  } else if (binding.protocolContractId === 'gemini-generate-content-v1beta' && extensionKind !== 'gemini_generate_content') {
    providerExtension = { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' }
  }
  const next = { ...selected, image, ...(providerExtension === undefined ? {} : { providerExtension }) }
  return rememberTargetImageV2(previous, rememberTargetThinkingV2(remembered, next, binding), binding)
}

// The provider namespace prevents another provider's controls from entering the request.
export function projectImageSettingsToSemanticV2(config: ImageGenerationUserConfig, openAI: boolean): Readonly<Record<string, unknown>> {
  if (!config.enabled) return { mode: 'disabled' }
  if (!openAI) return { mode: 'generate',
    ...(config.outputMode !== 'auto' ? { outputMode: config.outputMode } : {}),
    ...(config.aspectRatio && config.aspectRatio !== 'auto' ? { aspectRatio: config.aspectRatio } : {}),
    ...(config.imageSize ? { resolution: config.imageSize } : {}) }
  const settings = config.openAI ?? {}
  const { size, outputCompression, ...rest } = settings
  return { mode: 'generate', ...rest,
    ...(size === 'auto' ? { size } : size ? (() => {
      const match = /^(\d+)x(\d+)$/.exec(size)
      if (!match) throw new Error('GENERATION_V2_IMAGE_SIZE_INVALID')
      return { size: { width: Number(match[1]), height: Number(match[2]) } }
    })() : {}),
    ...(outputCompression !== undefined ? { outputCompression } : {}) }
}
