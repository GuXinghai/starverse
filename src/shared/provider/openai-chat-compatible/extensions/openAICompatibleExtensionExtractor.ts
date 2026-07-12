import type { CompatibleWireEvent } from '../wire'
import { compatibleExtensionPathMatches, normalizeCompatibleExtensionPath, parseCompatibleExtensionPath } from './pathDsl'
import { compatibleExtensionValueShape, createCompatibleDiscoveryPreview } from './rawRedactor'
import type { CompatibleDiscoveryObservation, CompatibleExtensionObservation, CompatibleSemanticExtensionCandidate } from './extensionTypes'
import type { CompatibleExtensionContext } from './extensionTypes'

export type CompatibleExtensionMapping = Readonly<{
  mappingId: string
  mappingVersion: number
  responseProfileId: string
  responseProfileVersion: number
  path: string
  semantic: 'reasoning' | 'diagnostic'
  mode: 'append' | 'snapshot'
}>

export function extractOpenAICompatibleExtensions(input: Readonly<{
  context: CompatibleExtensionContext
  events: readonly CompatibleWireEvent[]
  mappings: readonly CompatibleExtensionMapping[]
}>): Readonly<{
  observations: readonly CompatibleExtensionObservation[]
  semanticCandidates: readonly CompatibleSemanticExtensionCandidate[]
  discoveryObservations: readonly CompatibleDiscoveryObservation[]
}> {
  if (!Number.isSafeInteger(input.context.responseProfileVersion) || input.context.responseProfileVersion < 1) throw new Error('compatible_extension_context_invalid')
  const context: CompatibleExtensionContext = Object.freeze({
    ...input.context,
    allowedMappings: Object.freeze(input.context.allowedMappings.map((pin) => Object.freeze({ ...pin }))),
  })
  const mappings = input.mappings.map((mapping) => {
    if (mapping.responseProfileId !== context.responseProfileId || mapping.responseProfileVersion !== context.responseProfileVersion) {
      throw new Error('compatible_extension_mapping_profile_mismatch')
    }
    if (!context.allowedMappings.some((pin) => pin.mappingId === mapping.mappingId && pin.mappingVersion === mapping.mappingVersion)) {
      throw new Error('compatible_extension_mapping_not_pinned')
    }
    return { mapping, path: parseCompatibleExtensionPath(mapping.path) }
  })
  const observations: CompatibleExtensionObservation[] = []
  const semanticCandidates: CompatibleSemanticExtensionCandidate[] = []
  const discoveryObservations: CompatibleDiscoveryObservation[] = []
  let contentSeen = false
  for (const event of input.events) {
    if (event.kind === 'choice_content') contentSeen = true
    if (event.kind !== 'extension') continue
    const normalizedPath = normalizeCompatibleExtensionPath(event.candidate.sourcePath)
    const observation = Object.freeze({
      context,
      sequence: event.sequence,
      source: event.source,
      sourcePath: event.candidate.sourcePath,
      normalizedPath,
      ...(event.candidate.choiceIndex === undefined ? {} : { choiceIndex: event.candidate.choiceIndex }),
      value: event.candidate.value,
      valueShape: compatibleExtensionValueShape(event.candidate.value),
    })
    observations.push(observation)
    const match = mappings.find((candidate) => compatibleExtensionPathMatches(candidate.path, event.candidate.sourcePath))
    if (match) semanticCandidates.push(Object.freeze({ ...observation, ...match.mapping }))
    else discoveryObservations.push(Object.freeze({
      context,
      normalizedPath: normalizeDiscoveryPath(normalizedPath),
      source: event.source,
      shape: observation.valueShape,
      nonEmpty: event.candidate.value !== null && event.candidate.value !== '',
      timing: contentSeen ? 'after_content' : 'before_content',
      preview: createCompatibleDiscoveryPreview(event.candidate.value),
    }))
  }
  return Object.freeze({ observations: Object.freeze(observations), semanticCandidates: Object.freeze(semanticCandidates), discoveryObservations: Object.freeze(discoveryObservations) })
}

function normalizeDiscoveryPath(path: string): string {
  return path.replace(/\.delta\./g, '.payload.').replace(/\.message\./g, '.payload.')
}
