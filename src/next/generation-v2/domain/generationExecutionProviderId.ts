import {
  GenerationV2Identity,
  isGenerationV2Identity,
  type GenerationV2IdentityKind,
} from './identityV2'
import {
  decodeGenerationExecutionProviderId,
  GenerationExecutionProviderIdError,
  type GenerationExecutionProviderId,
} from '../../../shared/provider/generationExecutionProviderId'

export {
  decodeGenerationExecutionProviderId,
  GENERATION_EXECUTION_PROVIDER_IDS,
  GenerationExecutionProviderIdError,
  isGenerationExecutionProviderId,
  type GenerationExecutionProviderId,
} from '../../../shared/provider/generationExecutionProviderId'

export type GenerationExecutionProviderIdentityV2 = GenerationV2Identity<'provider_id'> & Readonly<{
  value: GenerationExecutionProviderId
}>

export function createGenerationExecutionProviderIdentityV2(
  value: unknown,
): GenerationExecutionProviderIdentityV2 {
  return GenerationV2Identity.create(
    'provider_id',
    decodeGenerationExecutionProviderId(value),
  ) as GenerationExecutionProviderIdentityV2
}

export function readGenerationExecutionProviderIdentityV2(
  value: GenerationV2Identity<GenerationV2IdentityKind>,
): GenerationExecutionProviderId {
  if (!isGenerationV2Identity(value, 'provider_id')) {
    throw new GenerationExecutionProviderIdError('GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID')
  }
  return decodeGenerationExecutionProviderId(value.value)
}
