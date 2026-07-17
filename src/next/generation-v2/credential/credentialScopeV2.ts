import { GenerationV2Identity, isGenerationV2Identity } from '../domain/identityV2'
import {
  CredentialScopeV2Error,
  deriveCredentialScopeIdV2Primitive,
} from '../../../../infra/security/credentialScopeV2Primitive'

export { CredentialScopeV2Error } from '../../../../infra/security/credentialScopeV2Primitive'

export function deriveCredentialScopeIdV2(input: Readonly<{
  epochScopeKey: Uint8Array
  providerId: GenerationV2Identity<'provider_id'>
  credential: string
}>): GenerationV2Identity<'credential_scope_id'> {
  if (!isGenerationV2Identity(input.providerId, 'provider_id')) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_PROVIDER_INVALID')
  }
  return GenerationV2Identity.create('credential_scope_id', deriveCredentialScopeIdV2Primitive({
    epochScopeKey: input.epochScopeKey,
    providerId: input.providerId.value,
    credential: input.credential,
  }))
}
