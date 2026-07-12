import {
  compatibleRegistryEndpointConfigSchema,
} from '../../src/shared/provider/openai-chat-compatible/registry/registrySchemas'
import type { CompatibleEndpointRevision } from '../../src/shared/provider/openai-chat-compatible/domain'

export type CompatibleProviderOperation = 'models' | 'chat_completions'

export type CompatibleProviderUrl = Readonly<{
  url: URL
  operation: CompatibleProviderOperation
  insecureHttp: boolean
}>

export type CompatibleProviderEndpointTransportConfig = Pick<
  CompatibleEndpointRevision,
  'baseUrl' | 'allowInsecureHttp' | 'securityPolicy' | 'ordinaryHeaders' | 'query'
>

const OPERATION_PATH: Readonly<Record<CompatibleProviderOperation, string>> = Object.freeze({
  models: 'models',
  chat_completions: 'chat/completions',
})

export function composeCompatibleProviderUrl(
  rawEndpoint: CompatibleProviderEndpointTransportConfig,
  operation: CompatibleProviderOperation,
): CompatibleProviderUrl {
  const endpoint = compatibleRegistryEndpointConfigSchema.parse({
    baseUrl: rawEndpoint.baseUrl,
    securityPolicy: rawEndpoint.securityPolicy,
    ordinaryHeaders: rawEndpoint.ordinaryHeaders,
    query: rawEndpoint.query,
  })
  if (endpoint.allowInsecureHttp !== rawEndpoint.allowInsecureHttp) throw new Error('compatible_url_invalid')
  const path = OPERATION_PATH[operation]
  if (!path) throw new Error('compatible_url_invalid')
  const apiRoot = new URL(`${endpoint.baseUrl}/`)
  const url = new URL(path, apiRoot)
  for (const entry of endpoint.query) {
    url.searchParams.append(entry.name, entry.value)
  }
  if (url.toString().length > 8_192) throw new Error('compatible_url_invalid')
  return Object.freeze({
    url,
    operation,
    insecureHttp: url.protocol === 'http:',
  })
}

export function compatibleSafeUrlIdentity(url: URL): Readonly<{
  protocol: 'http:' | 'https:'
  origin: string
  pathname: string
}> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('compatible_url_invalid')
  return Object.freeze({ protocol: url.protocol, origin: url.origin, pathname: url.pathname })
}
