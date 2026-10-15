import type { GenerationV2Identity } from '../domain/identityV2'

export type GenerationConfigRevisionScopeV2 = 'global' | 'project' | 'conversation'

export type GenerationConfigRevisionEntryV2 = Readonly<{
  ownerKind: GenerationConfigRevisionScopeV2
  ownerId: string
  revision: GenerationV2Identity<'config_revision'>
}>
