import {
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import type { ToolDefinitionV2 } from '../../tools/toolRegistryV2'

const MAX_TOOL_DEFINITIONS_BYTES = 1024 * 1024
const TOOL_REGISTRY_REVISION = /^tool-registry-v2:([a-f0-9]{64})$/u
const TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const FUNCTION_NAME = /^[A-Za-z0-9_-]{1,64}$/u

export type ToolDefinitionsProtocolV2 = 'openai-responses-v1' | 'lmstudio-openresponses'

export type ToolDefinitionsContextV2 = Readonly<{
  registryRevision: string
  definitionsDigest: string
  selectedDefinitions: readonly ToolDefinitionV2[]
}>

export type ToolDefinitionDefaultsV2 = Readonly<{
  parameters: 'empty_object'
  strict: boolean
}>

export type ToolDefinitionDefaultAdaptationV2 = Readonly<{
  path: 'function.parameters' | 'function.strict'
  operationId: 'tool_definition_defaults'
  value: 'empty_object' | boolean
}>

export type ResolvedToolDefinitionEntryV2 = Readonly<{
  sourceDefinition: ToolDefinitionV2
  effectiveDefinition: ToolDefinitionV2 & Readonly<{
    function: ToolDefinitionV2['function'] & Readonly<{
      parameters: Readonly<Record<string, unknown>>
      strict: boolean
    }>
  }>
  defaultsApplied: readonly ToolDefinitionDefaultAdaptationV2[]
}>

export type ResolvedToolDefinitionsV2 = Readonly<{
  registryRevision: string
  definitionsDigest: string
  definitions: readonly ResolvedToolDefinitionEntryV2[]
}>

export class ToolDefinitionResolutionV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID'
    | 'GENERATION_V2_TOOL_DEFINITION_REQUIRED_VALUE_MISSING') {
    super(code)
    this.name = 'ToolDefinitionResolutionV2Error'
  }
}

function fail(code: ToolDefinitionResolutionV2Error['code']): never {
  throw new ToolDefinitionResolutionV2Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype)
}

function freezeJson<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item)
    return Object.freeze(value) as T
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) freezeJson(item)
    return Object.freeze(value)
  }
  return value
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(stableSerializeProviderRequestBoundedV2(value, MAX_TOOL_DEFINITIONS_BYTES)) as T
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableSerializeProviderRequestBoundedV2(left, MAX_TOOL_DEFINITIONS_BYTES) ===
    stableSerializeProviderRequestBoundedV2(right, MAX_TOOL_DEFINITIONS_BYTES)
}

function readDefinition(value: unknown): ToolDefinitionV2 {
  if (!isRecord(value) || Object.keys(value).sort().join() !== ['function', 'kind', 'sideEffectPolicy', 'toolId'].join() ||
      typeof value.toolId !== 'string' || !TOOL_ID.test(value.toolId) || value.kind !== 'function' ||
      (value.sideEffectPolicy !== 'none' && value.sideEffectPolicy !== 'confirmation_required_each_execution') ||
      !isRecord(value.function) || Object.keys(value.function).some((key) => !['name', 'description', 'parameters', 'strict'].includes(key)) ||
      typeof value.function.name !== 'string' || !FUNCTION_NAME.test(value.function.name) ||
      (value.function.description !== undefined && typeof value.function.description !== 'string') ||
      (value.function.strict !== undefined && typeof value.function.strict !== 'boolean') ||
      (value.function.parameters !== undefined && !isRecord(value.function.parameters))) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  return freezeJson(canonicalClone(value)) as ToolDefinitionV2
}

function readContext(value: ToolDefinitionsContextV2): Readonly<{
  registryRevision: string
  definitionsDigest: string
  selectedDefinitions: readonly ToolDefinitionV2[]
}> {
  if (!isRecord(value) || Object.keys(value).sort().join() !== ['definitionsDigest', 'registryRevision', 'selectedDefinitions'].join() ||
      typeof value.registryRevision !== 'string' || typeof value.definitionsDigest !== 'string' ||
      !Array.isArray(value.selectedDefinitions) || value.selectedDefinitions.length === 0 || value.selectedDefinitions.length > 128 ||
      !/^[a-f0-9]{64}$/u.test(value.definitionsDigest)) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  const revisionDigest = TOOL_REGISTRY_REVISION.exec(value.registryRevision)?.[1]
  if (revisionDigest !== value.definitionsDigest) return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  const selectedDefinitions = value.selectedDefinitions.map(readDefinition)
  if (new Set(selectedDefinitions.map((definition) => definition.toolId)).size !== selectedDefinitions.length ||
      new Set(selectedDefinitions.map((definition) => definition.function.name)).size !== selectedDefinitions.length) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  return Object.freeze({
    registryRevision: value.registryRevision,
    definitionsDigest: value.definitionsDigest,
    selectedDefinitions: Object.freeze(selectedDefinitions),
  })
}

function readDefaults(value: ToolDefinitionDefaultsV2 | undefined): ToolDefinitionDefaultsV2 | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.keys(value).sort().join() !== ['parameters', 'strict'].join() ||
      value.parameters !== 'empty_object' || typeof value.strict !== 'boolean') {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  return Object.freeze({ parameters: 'empty_object', strict: value.strict })
}

function emptyObjectParameters(): Readonly<Record<string, unknown>> {
  return Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false })
}

export function resolveToolDefinitionsV2(
  contextInput: ToolDefinitionsContextV2,
  defaultsInput: ToolDefinitionDefaultsV2 | undefined,
  protocol: ToolDefinitionsProtocolV2,
): ResolvedToolDefinitionsV2 {
  if (protocol !== 'openai-responses-v1' && protocol !== 'lmstudio-openresponses') {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  const context = readContext(contextInput)
  const defaults = readDefaults(defaultsInput)
  const definitions = context.selectedDefinitions.map((sourceDefinition) => {
    const defaultsApplied: ToolDefinitionDefaultAdaptationV2[] = []
    let parameters = sourceDefinition.function.parameters
    let strict = sourceDefinition.function.strict
    if (parameters === undefined && defaults !== undefined) {
      parameters = emptyObjectParameters()
      defaultsApplied.push(Object.freeze({ path: 'function.parameters', operationId: 'tool_definition_defaults', value: defaults.parameters }))
    }
    if (strict === undefined && defaults !== undefined) {
      strict = defaults.strict
      defaultsApplied.push(Object.freeze({ path: 'function.strict', operationId: 'tool_definition_defaults', value: defaults.strict }))
    }
    if (parameters === undefined || strict === undefined) {
      return fail('GENERATION_V2_TOOL_DEFINITION_REQUIRED_VALUE_MISSING')
    }
    const effectiveDefinition = freezeJson(canonicalClone({
      ...sourceDefinition,
      function: { ...sourceDefinition.function, parameters, strict },
    })) as ResolvedToolDefinitionEntryV2['effectiveDefinition']
    return Object.freeze({ sourceDefinition, effectiveDefinition, defaultsApplied: Object.freeze(defaultsApplied) })
  })
  return Object.freeze({
    registryRevision: context.registryRevision,
    definitionsDigest: context.definitionsDigest,
    definitions: Object.freeze(definitions),
  })
}

export function decodeResolvedToolDefinitionsV2(value: unknown): ResolvedToolDefinitionsV2 {
  if (!isRecord(value) || Object.keys(value).sort().join() !== ['definitions', 'definitionsDigest', 'registryRevision'].join() ||
      typeof value.registryRevision !== 'string' || typeof value.definitionsDigest !== 'string' ||
      !Array.isArray(value.definitions) || value.definitions.length === 0 || value.definitions.length > 128) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  const revisionDigest = TOOL_REGISTRY_REVISION.exec(value.registryRevision)?.[1]
  if (revisionDigest !== value.definitionsDigest || !/^[a-f0-9]{64}$/u.test(value.definitionsDigest)) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  const definitions = value.definitions.map((rawEntry) => {
    if (!isRecord(rawEntry) || Object.keys(rawEntry).sort().join() !== ['defaultsApplied', 'effectiveDefinition', 'sourceDefinition'].join() ||
        !Array.isArray(rawEntry.defaultsApplied)) return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
    const sourceDefinition = readDefinition(rawEntry.sourceDefinition)
    const effectiveDefinition = readDefinition(rawEntry.effectiveDefinition)
    if (effectiveDefinition.function.parameters === undefined || effectiveDefinition.function.strict === undefined ||
        sourceDefinition.toolId !== effectiveDefinition.toolId || sourceDefinition.kind !== effectiveDefinition.kind ||
        sourceDefinition.function.name !== effectiveDefinition.function.name ||
        sourceDefinition.function.description !== effectiveDefinition.function.description ||
        sourceDefinition.sideEffectPolicy !== effectiveDefinition.sideEffectPolicy) {
      return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
    }
    const adaptations = rawEntry.defaultsApplied.map((rawAdaptation) => {
      if (!isRecord(rawAdaptation) || Object.keys(rawAdaptation).sort().join() !== ['operationId', 'path', 'value'].join() ||
          rawAdaptation.operationId !== 'tool_definition_defaults') {
        return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
      }
      if (rawAdaptation.path === 'function.parameters' && rawAdaptation.value === 'empty_object' &&
          sourceDefinition.function.parameters === undefined &&
          sameJson(effectiveDefinition.function.parameters, emptyObjectParameters())) {
        return Object.freeze({ path: 'function.parameters' as const, operationId: 'tool_definition_defaults' as const, value: 'empty_object' as const })
      }
      if (rawAdaptation.path === 'function.strict' && typeof rawAdaptation.value === 'boolean' &&
          sourceDefinition.function.strict === undefined && effectiveDefinition.function.strict === rawAdaptation.value) {
        return Object.freeze({ path: 'function.strict' as const, operationId: 'tool_definition_defaults' as const, value: rawAdaptation.value })
      }
      return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
    })
    const adaptationPaths = adaptations.map((adaptation) => adaptation.path)
    if (new Set(adaptationPaths).size !== adaptationPaths.length ||
        (sourceDefinition.function.parameters !== undefined &&
          !sameJson(sourceDefinition.function.parameters, effectiveDefinition.function.parameters)) ||
        (sourceDefinition.function.strict !== undefined && sourceDefinition.function.strict !== effectiveDefinition.function.strict) ||
        (sourceDefinition.function.parameters === undefined && !adaptationPaths.includes('function.parameters')) ||
        (sourceDefinition.function.strict === undefined && !adaptationPaths.includes('function.strict'))) {
      return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
    }
    return Object.freeze({ sourceDefinition, effectiveDefinition, defaultsApplied: Object.freeze(adaptations) })
  })
  if (new Set(definitions.map((entry) => entry.sourceDefinition.toolId)).size !== definitions.length ||
      new Set(definitions.map((entry) => entry.sourceDefinition.function.name)).size !== definitions.length) {
    return fail('GENERATION_V2_TOOL_DEFINITION_CONTEXT_INVALID')
  }
  return freezeJson(canonicalClone({ registryRevision: value.registryRevision,
    definitionsDigest: value.definitionsDigest, definitions })) as ResolvedToolDefinitionsV2
}
