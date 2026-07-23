import {
  stableSerializeProviderRequestBoundedV2,
  sha256PreparedBytesV2,
} from '../compiler/stableSerialize'

export const TOOL_REGISTRY_V2_SCHEMA_VERSION = 2 as const
export const TOOL_REGISTRY_V2_MAX_BYTES = 1024 * 1024
export const TOOL_REGISTRY_V2_MAX_DEFINITIONS = 128

export type ToolDefinitionV2 = Readonly<{
  toolId: string
  kind: 'function'
  function: Readonly<{
    name: string
    description?: string
    parameters?: Readonly<Record<string, unknown>>
    strict?: boolean
  }>
  sideEffectPolicy: 'none' | 'confirmation_required_each_execution'
}>

export type ToolRegistryRevisionV2 = Readonly<{
  schemaVersion: 2
  revision: string
  definitionsDigest: string
  definitions: readonly ToolDefinitionV2[]
  canonicalJson: string
}>

export class ToolRegistryV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_TOOL_REGISTRY_INVALID_SHAPE'
    | 'GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE'
    | 'GENERATION_V2_TOOL_REGISTRY_DUPLICATE_VALUE'
    | 'GENERATION_V2_TOOL_REGISTRY_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'ToolRegistryV2Error'
  }
}

const TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const FUNCTION_NAME = /^[A-Za-z0-9_-]{1,64}$/u

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_SHAPE')
  }
  const input = value as Record<string, unknown>
  if (Object.keys(input).some((key) => !allowed.includes(key)) || required.some((key) => !(key in input))) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_SHAPE')
  }
  return input
}

function cloneJson(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_LIMIT_EXCEEDED')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return Object.freeze(value.map((item) => cloneJson(item, depth + 1)))
  const input = closedObject(value, Object.keys(value as Record<string, unknown>), [])
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort()) output[key] = cloneJson(input[key], depth + 1)
  return Object.freeze(output)
}

function definition(value: unknown): ToolDefinitionV2 {
  const input = closedObject(value, ['toolId', 'kind', 'function', 'sideEffectPolicy'],
    ['toolId', 'kind', 'function', 'sideEffectPolicy'])
  const fn = closedObject(input.function, ['name', 'description', 'parameters', 'strict'], ['name'])
  if (typeof input.toolId !== 'string' || !TOOL_ID.test(input.toolId) || input.kind !== 'function' ||
      typeof fn.name !== 'string' || !FUNCTION_NAME.test(fn.name) ||
      (fn.description !== undefined && (typeof fn.description !== 'string' || fn.description.length > 16_384)) ||
      (fn.strict !== undefined && typeof fn.strict !== 'boolean') ||
      (input.sideEffectPolicy !== 'none' && input.sideEffectPolicy !== 'confirmation_required_each_execution')) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
  }
  let parameters: Readonly<Record<string, unknown>> | undefined
  if (fn.parameters !== undefined) {
    const cloned = cloneJson(fn.parameters)
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
      throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
    }
    parameters = cloned as Readonly<Record<string, unknown>>
  }
  return Object.freeze({
    toolId: input.toolId,
    kind: 'function' as const,
    function: Object.freeze({
      name: fn.name,
      ...(fn.description === undefined ? {} : { description: fn.description as string }),
      ...(parameters === undefined ? {} : { parameters }),
      ...(fn.strict === undefined ? {} : { strict: fn.strict as boolean }),
    }),
    sideEffectPolicy: input.sideEffectPolicy,
  })
}

export function decodeToolRegistryRevisionV2(value: unknown): ToolRegistryRevisionV2 {
  const input = closedObject(value, ['schemaVersion', 'definitions'], ['schemaVersion', 'definitions'])
  if (input.schemaVersion !== TOOL_REGISTRY_V2_SCHEMA_VERSION || !Array.isArray(input.definitions) ||
      input.definitions.length > TOOL_REGISTRY_V2_MAX_DEFINITIONS) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
  }
  const definitions = input.definitions.map(definition).sort((left, right) =>
    left.toolId < right.toolId ? -1 : left.toolId > right.toolId ? 1 : 0)
  if (new Set(definitions.map((item) => item.toolId)).size !== definitions.length ||
      new Set(definitions.map((item) => item.function.name)).size !== definitions.length) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_DUPLICATE_VALUE')
  }
  let canonicalJson: string
  try {
    canonicalJson = stableSerializeProviderRequestBoundedV2({
      schemaVersion: TOOL_REGISTRY_V2_SCHEMA_VERSION,
      definitions,
    }, TOOL_REGISTRY_V2_MAX_BYTES)
  } catch (error) {
    if ((error as Error)?.message === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_LIMIT_EXCEEDED')
    }
    throw error
  }
  const definitionsDigest = sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson))
  return Object.freeze({
    schemaVersion: TOOL_REGISTRY_V2_SCHEMA_VERSION,
    revision: `tool-registry-v2:${definitionsDigest}`,
    definitionsDigest,
    definitions: Object.freeze(definitions),
    canonicalJson,
  })
}

export function selectToolDefinitionsV2(
  registry: ToolRegistryRevisionV2,
  allowedToolIds: readonly string[],
): readonly ToolDefinitionV2[] {
  if (!registry || typeof registry !== 'object' || typeof registry.canonicalJson !== 'string' ||
      decodeToolRegistryRevisionV2(JSON.parse(registry.canonicalJson)).revision !== registry.revision ||
      allowedToolIds.length === 0 || new Set(allowedToolIds).size !== allowedToolIds.length) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
  }
  const byId = new Map(registry.definitions.map((item) => [item.toolId, item]))
  const selected = allowedToolIds.map((toolId) => byId.get(toolId))
  if (selected.some((item) => item === undefined)) {
    throw new ToolRegistryV2Error('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
  }
  return Object.freeze(selected as ToolDefinitionV2[])
}
