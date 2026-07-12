import { providerInstanceIdSchema } from '@/shared/provider/openai-chat-compatible/identity'

type RegistryBridge = NonNullable<Window['compatibleProviderRegistry']>
type RegistryDetails = CompatibleProviderRegistryDetails

export function createCompatibleProviderRegistryClient(bridge: RegistryBridge | undefined = window.compatibleProviderRegistry) {
  const call = async <T>(name: keyof RegistryBridge, payload?: unknown): Promise<T> => {
    const method = bridge?.[name]
    if (typeof method !== 'function') throw new Error('compatible_registry_bridge_unavailable')
    const result = await (method as (input?: unknown) => Promise<CompatibleProviderRegistryResult<T>>)(payload)
    if (!result?.ok) throw new Error(result?.error?.code ?? 'compatible_registry_unavailable')
    return result.value
  }
  return Object.freeze({
    list: () => call<readonly RegistryDetails[]>('list'),
    get: (providerInstanceId: string) => call<RegistryDetails>('get', { providerInstanceId: providerInstanceIdSchema.parse(providerInstanceId) }),
    create: (input: Parameters<NonNullable<RegistryBridge['create']>>[0]) => call<RegistryDetails>('create', input),
    update: (input: Parameters<NonNullable<RegistryBridge['update']>>[0]) => call<RegistryDetails>('update', { ...input, providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId) }),
    updateEndpoint: (input: Parameters<NonNullable<RegistryBridge['updateEndpoint']>>[0]) => call<RegistryDetails>('updateEndpoint', { ...input, providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId) }),
    reviseConfiguration: (input: Parameters<NonNullable<RegistryBridge['reviseConfiguration']>>[0]) => call<RegistryDetails>('reviseConfiguration', { ...input, providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId) }),
    listDiscovery: (providerInstanceId: string) => call<readonly CompatibleDiscoveredResponseField[]>('listDiscovery', { providerInstanceId: providerInstanceIdSchema.parse(providerInstanceId) }),
    ignoreDiscovery: (input: Parameters<NonNullable<RegistryBridge['ignoreDiscovery']>>[0]) => call<readonly CompatibleDiscoveredResponseField[]>('ignoreDiscovery', { ...input, providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId) }),
    rotateCredential: (input: Parameters<NonNullable<RegistryBridge['rotateCredential']>>[0]) => call<RegistryDetails>('rotateCredential', { ...input, providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId) }),
    deleteCredential: (credentialVersionRef: string) => call<RegistryDetails>('deleteCredential', { credentialVersionRef }),
    deleteProvider: (providerInstanceId: string) => call<RegistryDetails>('deleteProvider', { providerInstanceId: providerInstanceIdSchema.parse(providerInstanceId) }),
  })
}
