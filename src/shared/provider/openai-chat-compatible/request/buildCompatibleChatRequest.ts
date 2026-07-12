import { z } from 'zod'
import {
  compatibleBoundedJsonValueSchema,
  compatibleObjectPathSchema,
  compatibleRequestProfileConfigSchema,
  compatibleRequestFieldMappingConfigSchema,
  type CompatibleRequestFieldMappingConfig,
  type CompatibleRequestProfileConfig,
  isCompatibleSecretLikeFieldName,
  looksLikeCompatibleSecretValue,
} from '../schemas'
import { compatibleModelIdSchema } from '../identity'
import { assertCompatiblePathAvailable, enumerateCompatibleJsonPaths, setCompatibleJsonPath, type CompatibleOwnedPath } from './fieldOwnership'
import type {
  CompatibleFieldState,
  CompatibleFunctionTool,
  CompatibleJsonValue,
  CompatibleReasoningControlState,
  CompatibleRequestMessage,
} from './messageTypes'

export type CompatibleStandardFieldName =
  | 'temperature' | 'top_p' | 'max_tokens' | 'max_completion_tokens' | 'stop' | 'seed'
  | 'frequency_penalty' | 'presence_penalty' | 'user' | 'metadata' | 'response_format'
  | 'stream_options' | 'n' | 'tools' | 'tool_choice' | 'parallel_tool_calls'

export type CompatibleRequestFieldSettings = Partial<Record<CompatibleStandardFieldName, CompatibleFieldState<CompatibleJsonValue>>>

export type CompatibleRequestBuildResult = Readonly<{
  body: Readonly<Record<string, CompatibleJsonValue>>
  serialized: string
  diagnostics: readonly CompatibleOwnedPath[]
  choiceCount: number
}>

const STANDARD_FIELDS: readonly CompatibleStandardFieldName[] = [
  'temperature', 'top_p', 'max_tokens', 'max_completion_tokens', 'stop', 'seed',
  'frequency_penalty', 'presence_penalty', 'user', 'metadata', 'response_format',
  'stream_options', 'n', 'tools', 'tool_choice', 'parallel_tool_calls',
]
const PROTECTED_PATHS = ['model', 'messages', 'stream', ...STANDARD_FIELDS]
const INTERNAL_ONLY_PATHS = [
  'providerInstanceId', 'endpointRevisionId', 'credentialVersionRef', 'requestProfileId',
  'responseProfileId', 'routeProvenanceId', 'baseUrl', 'headers', 'query', 'auth', 'apiKey',
]

const contentPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({ url: z.string(), detail: z.enum(['auto', 'low', 'high']).optional() }).strict(),
  }).strict(),
])
const contentSchema = z.union([z.string(), z.array(contentPartSchema)])
const toolCallSchema = z.object({
  id: z.string(), type: z.literal('function'),
  function: z.object({ name: z.string(), arguments: z.string() }).strict(),
}).strict()
const wireMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.enum(['system', 'developer', 'user']), content: contentSchema }).strict(),
  z.object({ role: z.literal('assistant'), content: contentSchema.nullable(), tool_calls: z.array(toolCallSchema).optional() }).strict(),
  z.object({ role: z.literal('tool'), tool_call_id: z.string(), content: z.string() }).strict(),
])

export function buildCompatibleChatRequest(input: Readonly<{
  modelId: string
  messages: readonly CompatibleRequestMessage[]
  stream: boolean
  profile: CompatibleRequestProfileConfig
  fields?: CompatibleRequestFieldSettings
  reasoningControls?: CompatibleReasoningControlState
  requestMappings?: readonly CompatibleRequestFieldMappingConfig[]
  extraBody?: CompatibleJsonValue
}>): CompatibleRequestBuildResult {
  const model = compatibleModelIdSchema.parse(input.modelId)
  const profile = compatibleRequestProfileConfigSchema.parse(input.profile)
  const allowedDefaults = new Set([...STANDARD_FIELDS, 'reasoning_enabled', 'reasoning_effort', 'reasoning_budget'])
  if (Object.keys(profile.defaults).some((key) => !allowedDefaults.has(key as CompatibleStandardFieldName))) {
    throw new Error('compatible_request_profile_default_unsupported')
  }
  if (input.fields && Object.keys(input.fields).some((key) => !STANDARD_FIELDS.includes(key as CompatibleStandardFieldName))) {
    throw new Error('compatible_request_field_unsupported')
  }
  for (const setting of Object.values(input.fields ?? {})) {
    if (!setting || !['unset', 'explicit', 'profile_default'].includes(setting.state) ||
      (setting.state === 'explicit' && !Object.prototype.hasOwnProperty.call(setting, 'value'))) {
      throw new Error('compatible_request_field_invalid')
    }
  }
  const reasoningKeys = ['reasoning_enabled', 'reasoning_effort', 'reasoning_budget'] as const
  if (input.reasoningControls && Object.keys(input.reasoningControls).some((key) => !reasoningKeys.includes(key as typeof reasoningKeys[number]))) {
    throw new Error('compatible_request_mapping_invalid')
  }
  const messages = validateMessages(input.messages)
  const body: Record<string, CompatibleJsonValue> = { model, messages: messages as unknown as CompatibleJsonValue, stream: input.stream }
  const diagnostics: CompatibleOwnedPath[] = [
    owned(['model'], 'builder', 'explicit'), owned(['messages'], 'builder', 'explicit'), owned(['stream'], 'builder', 'explicit'),
  ]

  for (const name of STANDARD_FIELDS) {
    const setting = input.fields?.[name]
    if (!setting || setting.state === 'unset') continue
    const rawValue = setting.state === 'explicit' ? setting.value : (profile.defaults as Record<string, unknown>)[name]
    if (rawValue === undefined) throw new Error(`compatible_request_profile_default_missing:${name}`)
    const value = validateStandardField(name, rawValue)
    body[name] = value
    diagnostics.push(owned([name], 'builder', setting.state))
  }
  if (body.max_tokens !== undefined && body.max_completion_tokens !== undefined) {
    throw new Error('compatible_request_token_limit_conflict')
  }
  if (body.stream_options !== undefined && input.stream !== true) throw new Error('compatible_request_stream_options_invalid')
  if ((body.tool_choice !== undefined || body.parallel_tool_calls === true) && body.tools === undefined) {
    throw new Error('compatible_request_tools_required')
  }
  if (body.tool_choice && typeof body.tool_choice === 'object' && !Array.isArray(body.tool_choice)) {
    const chosen = (body.tool_choice.function as Record<string, CompatibleJsonValue> | undefined)?.name
    const names = Array.isArray(body.tools)
      ? body.tools.map((tool) => ((tool as Record<string, CompatibleJsonValue>).function as Record<string, CompatibleJsonValue>).name)
      : []
    if (typeof chosen === 'string' && !names.includes(chosen)) throw new Error('compatible_request_tool_choice_invalid')
  }

  const allProtected = [...PROTECTED_PATHS, ...INTERNAL_ONLY_PATHS].map((name) => owned([name], 'builder', 'explicit'))
  const mappings = input.requestMappings ?? []
  for (const key of reasoningKeys) {
    const control = input.reasoningControls?.[key]
    if (control && control.state !== 'unset' && !mappings.some((mapping) => mapping.sourceField === key)) {
      throw new Error('compatible_request_mapping_missing')
    }
  }
  for (const rawMapping of mappings) {
    const mapping = compatibleRequestFieldMappingConfigSchema.parse(rawMapping)
    const path = compatibleObjectPathSchema.parse(mapping.targetPath)
    if (path.some((segment) => typeof segment === 'string' &&
      (INTERNAL_ONLY_PATHS.includes(segment) || isCompatibleSecretLikeFieldName(segment)))) {
      throw new Error('compatible_request_mapping_invalid')
    }
    assertCompatiblePathAvailable(path, 'mapping', [...allProtected, ...diagnostics.filter((entry) => entry.owner === 'mapping')])
    const control = input.reasoningControls?.[mapping.sourceField]
    if (!control || control.state === 'unset') {
      if (mapping.omission === 'required') throw new Error('compatible_request_mapping_required')
      continue
    }
    const sourceValue = control.state === 'explicit'
      ? control.value
      : (profile.defaults as Record<string, unknown>)[mapping.sourceField]
    if (sourceValue === undefined) throw new Error('compatible_request_mapping_default_missing')
    if (typeof sourceValue !== mapping.valueKind) throw new Error('compatible_request_mapping_invalid')
    const mapped = mapping.valueMapping[String(sourceValue)]
    if (mapped === undefined) throw new Error('compatible_request_mapping_invalid')
    setCompatibleJsonPath(body, path, compatibleBoundedJsonValueSchema.parse(mapped) as CompatibleJsonValue)
    diagnostics.push(owned(path, 'mapping', control.state))
  }

  if (input.extraBody !== undefined) {
    if (!profile.extraBody.enabled) throw new Error('compatible_extra_body_disabled')
    const extra = assertCompatibleExtraBody(input.extraBody, profile.extraBody)
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('compatible_extra_body_invalid')
    const paths = enumerateCompatibleJsonPaths(extra)
    for (const path of paths) assertCompatiblePathAvailable(path, 'extra_body', [...allProtected, ...diagnostics])
    mergeObjects(body, extra as Record<string, CompatibleJsonValue>)
    diagnostics.push(...paths.map((path) => owned(path, 'extra_body', 'explicit')))
  }

  const validated = assertCompatibleWireJson(body)
  const serialized = stableStringify(validated)
  return Object.freeze({
    body: Object.freeze(validated),
    serialized,
    diagnostics: Object.freeze(diagnostics.map((entry) => Object.freeze({ ...entry, path: Object.freeze([...entry.path]) }))),
    choiceCount: typeof validated.n === 'number' ? validated.n : 1,
  })
}

function owned(path: readonly (string | number)[], owner: CompatibleOwnedPath['owner'], state: CompatibleOwnedPath['state']): CompatibleOwnedPath {
  return { path, owner, state }
}

function validateMessages(messages: readonly CompatibleRequestMessage[]): readonly CompatibleRequestMessage[] {
  if (Array.isArray(messages)) {
    for (const rawMessage of messages as readonly unknown[]) {
      const content = rawMessage && typeof rawMessage === 'object' ? (rawMessage as { content?: unknown }).content : undefined
      if (Array.isArray(content) && content.some((part) => !part || typeof part !== 'object' ||
        !['text', 'image_url'].includes(String((part as { type?: unknown }).type ?? '')))) {
        throw new Error('compatible_request_content_unsupported')
      }
    }
  }
  const parsed = wireMessageSchema.array().min(1).max(512).safeParse(messages)
  if (!parsed.success) throw new Error('compatible_request_messages_invalid')
  const toolCalls = new Set<string>()
  const toolResults = new Set<string>()
  const pendingToolCalls = new Set<string>()
  const validated = parsed.data.map((message) => {
    if (!message || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) throw new Error('compatible_request_messages_invalid')
    if (message.role === 'tool') {
      if (!validId(message.tool_call_id) || !pendingToolCalls.has(message.tool_call_id) || toolResults.has(message.tool_call_id) ||
        typeof message.content !== 'string' || message.content.length > 1_000_000) {
        throw new Error('compatible_request_tool_result_invalid')
      }
      toolResults.add(message.tool_call_id)
      pendingToolCalls.delete(message.tool_call_id)
      return message
    }
    if (pendingToolCalls.size > 0) throw new Error('compatible_request_tool_result_invalid')
    validateContent(message.content, message.role)
    if (message.role === 'assistant' && message.tool_calls) {
      if (message.tool_calls.length < 1 || message.tool_calls.length > 128) throw new Error('compatible_request_tools_invalid')
      for (const call of message.tool_calls) {
        if (!validId(call.id) || toolCalls.has(call.id) || call.type !== 'function' || !validName(call.function.name) ||
          typeof call.function.arguments !== 'string' || call.function.arguments.length > 1_000_000 || !isJsonObjectText(call.function.arguments)) {
          throw new Error('compatible_request_tools_invalid')
        }
        toolCalls.add(call.id)
        pendingToolCalls.add(call.id)
      }
    }
    if (message.role === 'assistant' && message.content === null && !message.tool_calls?.length) {
      throw new Error('compatible_request_content_invalid')
    }
    return message
  })
  if (pendingToolCalls.size > 0) throw new Error('compatible_request_tool_result_invalid')
  return validated as readonly CompatibleRequestMessage[]
}

function validateContent(content: CompatibleRequestMessage['content'], role: Exclude<CompatibleRequestMessage['role'], 'tool'>): void {
  if (content === null) {
    if (role !== 'assistant') throw new Error('compatible_request_content_invalid')
    return
  }
  if (typeof content === 'string') {
    if (content.length > 1_000_000) throw new Error('compatible_request_content_invalid')
    return
  }
  if (!Array.isArray(content) || content.length < 1 || content.length > 64) throw new Error('compatible_request_content_invalid')
  for (const part of content) {
    if (part.type === 'text') {
      if (typeof part.text !== 'string' || part.text.length > 1_000_000) throw new Error('compatible_request_content_invalid')
    } else if (part.type === 'image_url') {
      if (role !== 'user') throw new Error('compatible_request_content_unsupported')
      const url = part.image_url?.url
      if (typeof url !== 'string' || url.length > 7_000_000 || (!/^https:\/\//u.test(url) && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/u.test(url))) {
        throw new Error('compatible_request_image_invalid')
      }
    } else {
      throw new Error('compatible_request_content_unsupported')
    }
  }
}

function validateStandardField(name: CompatibleStandardFieldName, raw: unknown): CompatibleJsonValue {
  const value = compatibleBoundedJsonValueSchema.parse(raw) as CompatibleJsonValue
  if (name === 'temperature' || name === 'top_p') assertNumber(value, 0, name === 'temperature' ? 2 : 1)
  if (name === 'frequency_penalty' || name === 'presence_penalty') assertNumber(value, -2, 2)
  if (name === 'seed') assertInteger(value, -2_147_483_648, 2_147_483_647)
  if (name === 'max_tokens' || name === 'max_completion_tokens') assertInteger(value, 1, 2_147_483_647)
  if (name === 'n') assertInteger(value, 1, 16)
  if (name === 'user' && (typeof value !== 'string' || value.length > 256)) throw new Error(`compatible_request_field_invalid:${name}`)
  if (name === 'stop' && !(typeof value === 'string' && value.length <= 1024 || (Array.isArray(value) && value.length <= 4 && value.every((item) => typeof item === 'string' && item.length <= 1024)))) {
    throw new Error(`compatible_request_field_invalid:${name}`)
  }
  if (name === 'parallel_tool_calls' && typeof value !== 'boolean') throw new Error(`compatible_request_field_invalid:${name}`)
  if (name === 'tools') validateTools(value)
  if (name === 'tool_choice') validateToolChoice(value)
  if (name === 'response_format') validateResponseFormat(value)
  if (name === 'stream_options') {
    if (!isPlainObject(value) || Object.keys(value).some((key) => key !== 'include_usage') ||
      (value.include_usage !== undefined && typeof value.include_usage !== 'boolean')) throw new Error(`compatible_request_field_invalid:${name}`)
  }
  if (name === 'metadata' && !isPlainObject(value)) throw new Error(`compatible_request_field_invalid:${name}`)
  if (name === 'metadata' && containsInternalOnlyKey(value)) throw new Error(`compatible_request_field_invalid:${name}`)
  return value
}

function validateTools(value: CompatibleJsonValue): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw new Error('compatible_request_tools_invalid')
  const names = new Set<string>()
  for (const raw of value) {
    const tool = raw as unknown as CompatibleFunctionTool
    if (!isPlainObject(raw) || tool.type !== 'function' || !isPlainObject(tool.function as unknown as CompatibleJsonValue) ||
      Object.keys(raw).some((key) => !['type', 'function'].includes(key)) ||
      Object.keys(tool.function).some((key) => !['name', 'description', 'parameters', 'strict'].includes(key)) ||
      !validName(tool.function.name) || names.has(tool.function.name) ||
      (tool.function.description !== undefined && (typeof tool.function.description !== 'string' || tool.function.description.length > 4096)) ||
      (tool.function.strict !== undefined && typeof tool.function.strict !== 'boolean') || !isPlainObject(tool.function.parameters)) {
      throw new Error('compatible_request_tools_invalid')
    }
    names.add(tool.function.name)
  }
}

function validateToolChoice(value: CompatibleJsonValue): void {
  if (value === 'none' || value === 'auto' || value === 'required') return
  if (!isPlainObject(value) || value.type !== 'function' || !isPlainObject(value.function as CompatibleJsonValue) ||
    Object.keys(value).some((key) => !['type', 'function'].includes(key)) ||
    Object.keys(value.function as Record<string, CompatibleJsonValue>).some((key) => key !== 'name') ||
    !validName(String((value.function as Record<string, CompatibleJsonValue>).name ?? ''))) {
    throw new Error('compatible_request_tool_choice_invalid')
  }
}

function validateResponseFormat(value: CompatibleJsonValue): void {
  if (!isPlainObject(value) || !['text', 'json_object', 'json_schema'].includes(String(value.type ?? ''))) throw new Error('compatible_request_response_format_invalid')
  if (value.type === 'json_schema') {
    const jsonSchema = value.json_schema
    if (!isPlainObject(jsonSchema) || !validName(String(jsonSchema.name ?? '')) || !isPlainObject(jsonSchema.schema as CompatibleJsonValue) ||
      (jsonSchema.strict !== undefined && typeof jsonSchema.strict !== 'boolean') ||
      (jsonSchema.description !== undefined && (typeof jsonSchema.description !== 'string' || jsonSchema.description.length > 4096)) ||
      Object.keys(jsonSchema).some((key) => !['name', 'description', 'schema', 'strict'].includes(key)) ||
      Object.keys(value).some((key) => !['type', 'json_schema'].includes(key))) throw new Error('compatible_request_response_format_invalid')
  } else if (Object.keys(value).some((key) => key !== 'type')) throw new Error('compatible_request_response_format_invalid')
}

function assertNumber(value: CompatibleJsonValue, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('compatible_request_field_invalid')
}

function assertInteger(value: CompatibleJsonValue, min: number, max: number): void {
  assertNumber(value, min, max)
  if (!Number.isInteger(value)) throw new Error('compatible_request_field_invalid')
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,256}$/u.test(value)
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(value)
}

function isJsonObjectText(value: string): boolean {
  try {
    const parsed = JSON.parse(value)
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  } catch {
    return false
  }
}

function isPlainObject(value: CompatibleJsonValue): value is Record<string, CompatibleJsonValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype)
}

function mergeObjects(target: Record<string, CompatibleJsonValue>, source: Record<string, CompatibleJsonValue>): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key]
    if (isPlainObject(current) && isPlainObject(value)) mergeObjects(current, value)
    else target[key] = value
  }
}

function assertCompatibleExtraBody(
  value: unknown,
  limits: CompatibleRequestProfileConfig['extraBody'],
): CompatibleJsonValue {
  let keys = 0
  const ancestors = new WeakSet<object>()
  const visit = (candidate: unknown, depth: number): void => {
    if (depth > limits.maxDepth) throw new Error('compatible_extra_body_overflow')
    if (candidate === null || typeof candidate === 'boolean') return
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error('compatible_extra_body_invalid')
      return
    }
    if (typeof candidate === 'string') {
      if (candidate.length > 1_000_000 || looksLikeCompatibleSecretValue(candidate)) throw new Error('compatible_extra_body_invalid')
      return
    }
    if (!candidate || typeof candidate !== 'object') throw new Error('compatible_extra_body_invalid')
    if (ancestors.has(candidate)) throw new Error('compatible_extra_body_cycle')
    if (!Array.isArray(candidate) && Object.getPrototypeOf(candidate) !== Object.prototype) throw new Error('compatible_extra_body_invalid')
    ancestors.add(candidate)
    try {
      const entries = Array.isArray(candidate) ? candidate.map((item, index) => [String(index), item] as const) : Object.entries(candidate)
      keys += entries.length
      if (keys > limits.maxKeys) throw new Error('compatible_extra_body_overflow')
      for (const [key, child] of entries) {
        if (!Array.isArray(candidate) && INTERNAL_ONLY_PATHS.includes(key)) {
          throw new Error('compatible_request_path_conflict')
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' ||
          (!Array.isArray(candidate) && isCompatibleSecretLikeFieldName(key))) {
          throw new Error('compatible_extra_body_invalid')
        }
        visit(child, depth + 1)
      }
    } finally {
      ancestors.delete(candidate)
    }
  }
  visit(value, 0)
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error('compatible_extra_body_invalid')
  }
  if (serialized === undefined || utf8ByteLength(serialized) > limits.maxBytes) throw new Error('compatible_extra_body_overflow')
  return value as CompatibleJsonValue
}

function stableStringify(value: CompatibleJsonValue): string {
  return JSON.stringify(sortJson(value))
}

function assertCompatibleWireJson(value: Record<string, CompatibleJsonValue>): Record<string, CompatibleJsonValue> {
  let nodes = 0
  const visit = (candidate: CompatibleJsonValue, depth: number): void => {
    nodes += 1
    if (nodes > 100_000 || depth > 32) throw new Error('compatible_request_body_overflow')
    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'string') return
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error('compatible_request_body_invalid')
      return
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1)
      return
    }
    if (Object.getPrototypeOf(candidate) !== Object.prototype) throw new Error('compatible_request_body_invalid')
    for (const [key, child] of Object.entries(candidate)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error('compatible_request_body_invalid')
      visit(child, depth + 1)
    }
  }
  visit(value, 0)
  if (utf8ByteLength(stableStringify(value)) > 2 * 1024 * 1024) throw new Error('compatible_request_body_overflow')
  return value
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function sortJson(value: CompatibleJsonValue): CompatibleJsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key]!)]))
}

function containsInternalOnlyKey(value: CompatibleJsonValue): boolean {
  if (Array.isArray(value)) return value.some(containsInternalOnlyKey)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => INTERNAL_ONLY_PATHS.includes(key) || containsInternalOnlyKey(child))
}
