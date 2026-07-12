import type { CompatibleDiscoveryObservation, CompatibleExtensionValueShape } from './extensionTypes'

const EXCLUDED_FAMILIES = /(?:^|\.)(?:audio|citation|citations|metadata|refusal|status|trace)(?:\.|$)/i
const BUILTIN_REASONING = /(?:^|\.)(?:reasoning|reasoning_content|thinking)(?:\.|$)/i

export type CompatibleDiscoveryAggregate = Readonly<{
  observedShapes: readonly CompatibleExtensionValueShape[]
  sampleCount: number
  nonEmptySampleCount: number
  timing: Readonly<Record<CompatibleDiscoveryObservation['timing'], number>>
  seenInStream: boolean
  seenInFinal: boolean
  streamFinalPaired: boolean
  confidence: number
  excluded: boolean
}>

export function aggregateCompatibleDiscovery(observations: readonly CompatibleDiscoveryObservation[]): Map<string, CompatibleDiscoveryAggregate> {
  const identity = observations[0]?.context
  if (identity && observations.some((observation) => observation.context.routeProvenanceId !== identity.routeProvenanceId || observation.context.responseProfileId !== identity.responseProfileId || observation.context.responseProfileVersion !== identity.responseProfileVersion)) {
    throw new Error('compatible_discovery_identity_mismatch')
  }
  const groups = new Map<string, CompatibleDiscoveryObservation[]>()
  for (const observation of observations) {
    if (BUILTIN_REASONING.test(observation.normalizedPath)) continue
    const group = groups.get(observation.normalizedPath) ?? []
    group.push(observation)
    groups.set(observation.normalizedPath, group)
  }
  if (groups.size > 128) throw new Error('compatible_discovery_candidate_limit_exceeded')
  return new Map([...groups].map(([path, samples]) => {
    const shapes = [...new Set(samples.map((sample) => sample.shape))]
    const seenInStream = samples.some((sample) => sample.source === 'stream')
    const seenInFinal = samples.some((sample) => sample.source === 'non_stream')
    const nonEmptySampleCount = samples.filter((sample) => sample.nonEmpty).length
    const timing = { before_content: 0, alongside_content: 0, after_content: 0, unknown: 0 }
    for (const sample of samples) timing[sample.timing] += 1
    const stable = shapes.length === 1
    const confidence = Math.min(1, (nonEmptySampleCount > 1 ? 0.4 : 0.2) + (stable ? 0.3 : 0) + (seenInStream && seenInFinal ? 0.3 : 0))
    return [path, Object.freeze({ observedShapes: Object.freeze(shapes), sampleCount: samples.length, nonEmptySampleCount, timing: Object.freeze(timing), seenInStream, seenInFinal, streamFinalPaired: seenInStream && seenInFinal, confidence, excluded: EXCLUDED_FAMILIES.test(path) })]
  }))
}
