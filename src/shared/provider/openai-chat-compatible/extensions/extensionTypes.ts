import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleWireSource } from '../wire'

export type CompatibleExtensionSemantic = 'reasoning' | 'diagnostic'
export type CompatibleExtensionMode = 'append' | 'snapshot'

export type CompatibleExtensionContext = Readonly<{
  routeProvenanceId: string
  messageId: string
  providerInstanceId: string
  responseProfileId: string
  responseProfileVersion: number
  allowedMappings: readonly Readonly<{ mappingId: string; mappingVersion: number }>[]
}>

export type CompatibleExtensionObservation = Readonly<{
  context: CompatibleExtensionContext
  sequence: number
  source: CompatibleWireSource
  sourcePath: readonly (string | number)[]
  normalizedPath: string
  choiceIndex?: number
  value: CompatibleJsonValue
  valueShape: CompatibleExtensionValueShape
}>

export type CompatibleSemanticExtensionCandidate = CompatibleExtensionObservation & Readonly<{
  mappingId: string
  mappingVersion: number
  semantic: CompatibleExtensionSemantic
  mode: CompatibleExtensionMode
}>

export type CompatibleExtensionValueShape = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object'

export type CompatibleRawExtensionDraft = Readonly<{
  context: CompatibleExtensionContext
  choiceIndex: number
  sourcePath: string
  sequenceStart: number
  sequenceEnd: number
  mode: CompatibleExtensionMode
  semantic: CompatibleExtensionSemantic
  value: CompatibleJsonValue
  valueBytes: number
  redactionState: 'redacted' | 'truncated_redacted' | 'dropped'
}>

export type CompatibleDiscoveryObservation = Readonly<{
  context: CompatibleExtensionContext
  normalizedPath: string
  source: CompatibleWireSource
  shape: CompatibleExtensionValueShape
  nonEmpty: boolean
  timing: 'before_content' | 'alongside_content' | 'after_content' | 'unknown'
  preview: string | null
}>
