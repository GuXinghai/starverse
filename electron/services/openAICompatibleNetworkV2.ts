import type { OpenAICompatibleEndpointRevisionV2 } from '../../infra/db/repo/openAICompatibleV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'

type CredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>

export function assertOpenAICompatibleTransportPolicyV2(endpoint: OpenAICompatibleEndpointRevisionV2): void {
  if (endpoint.securityPolicy === 'strict_ssrf') throw new Error('compatible_strict_ssrf_unavailable')
}

export async function createOpenAICompatibleHeadersV2(input: Readonly<{
  credentialService: CredentialService
  providerInstanceId: string
  endpoint: OpenAICompatibleEndpointRevisionV2
  expectedRevision?: number
  expectedCredentialScopeId?: CredentialScopeIdV2
  accept: string
}>): Promise<Headers> {
  assertOpenAICompatibleTransportPolicyV2(input.endpoint)
  const headers = new Headers({ accept: input.accept })
  for (const entry of input.endpoint.ordinaryHeaders as readonly { name: string; value: string }[]) headers.set(entry.name, entry.value)
  const auth = input.endpoint.auth as { mode?: unknown; credentialVersionRef?: unknown }
  if (auth.mode === 'none') return headers
  if ((auth.mode !== 'bearer' && auth.mode !== 'basic' && auth.mode !== 'custom_headers') || typeof auth.credentialVersionRef !== 'string') {
    throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
  }
  const status = await input.credentialService.getStatus(input.providerInstanceId, auth.credentialVersionRef)
  if (!status.configured || !status.credentialScopeId || status.revision < 1) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
  if (input.expectedRevision !== undefined && input.expectedRevision !== status.revision ||
      input.expectedCredentialScopeId !== undefined && input.expectedCredentialScopeId !== status.credentialScopeId) {
    throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
  }
  return input.credentialService.withCredential({ providerInstanceId: input.providerInstanceId,
    credentialVersionRef: auth.credentialVersionRef, expectedRevision: status.revision,
    expectedCredentialScopeId: status.credentialScopeId, consume: (lease) => {
      if (lease.credential.mode !== auth.mode) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
      if (lease.credential.mode === 'bearer') headers.set('authorization', `Bearer ${lease.credential.token}`)
      else if (lease.credential.mode === 'basic') {
        const bytes = Buffer.from(`${lease.credential.username}:${lease.credential.password}`, 'utf8')
        try { headers.set('authorization', `Basic ${bytes.toString('base64')}`) } finally { bytes.fill(0) }
      } else if (lease.credential.mode === 'custom_headers') {
        for (const entry of lease.credential.headers) headers.set(entry.name, entry.value)
      }
      return headers
    } })
}
