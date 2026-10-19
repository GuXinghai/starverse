import {
  apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2, apiBodyUnionV2, type ApiRequestBodySchemaNodeV2,
} from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const number = apiBodyNumberV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()
const message = apiBodyObjectV2({ role: apiBodyStringV2({ enum: ['system', 'developer', 'user', 'assistant', 'tool'] }),
  content: apiBodyUnionV2(string, apiBodyArrayV2(json)), tool_calls: apiBodyArrayV2(json), tool_call_id: string }, ['role'], json)
const functionTool = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['function', 'openrouter:web_search'] }),
  function: json, parameters: json }, ['type'], json)
const toolChoice = apiBodyUnionV2(apiBodyStringV2({ enum: ['none', 'auto', 'required'] }),
  apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['function'] }), function: apiBodyObjectV2({ name: string }, ['name']) }, ['type', 'function']))
const responseFormat = apiBodyUnionV2(
  apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['text', 'json_object'] }) }, ['type']),
  apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['json_schema'] }), json_schema: json }, ['type', 'json_schema']),
)
const streamOptions = apiBodyObjectV2({ include_usage: apiBodyBooleanV2() }, ['include_usage'])

function baseChatSchema(properties: Readonly<Record<string, ApiRequestBodySchemaNodeV2>>,
  required: readonly string[] = ['model', 'messages', 'stream']): ApiRequestBodySchemaNodeV2 {
  return apiBodyObjectV2({ model: string, messages: apiBodyArrayV2(message, { minItems: 1 }), stream: apiBodyBooleanV2(),
    stream_options: streamOptions, max_tokens: integer, max_completion_tokens: integer, max_output_tokens: integer,
    temperature: number, top_p: number, top_k: integer, min_p: number, top_a: number, seed: integer,
    stop: apiBodyUnionV2(string, apiBodyArrayV2(string)), frequency_penalty: number, presence_penalty: number,
    repetition_penalty: number, tools: apiBodyArrayV2(functionTool, { minItems: 1 }), tool_choice: toolChoice,
    parallel_tool_calls: apiBodyBooleanV2(), response_format: responseFormat, reasoning: json, reasoning_effort: string,
    verbosity: string, ...properties }, required)
}

export const OPENROUTER_CHAT_REQUEST_BODY_SCHEMA_V2 = baseChatSchema({}, ['model', 'messages', 'stream', 'stream_options'])
export const DEEPSEEK_CHAT_REQUEST_BODY_SCHEMA_V2 = baseChatSchema({
  thinking: apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['enabled', 'disabled'] }) }, ['type']),
}, ['model', 'messages', 'stream', 'stream_options', 'thinking'])
export const GENERIC_LOCAL_CHAT_REQUEST_BODY_SCHEMA_V2 = baseChatSchema({}, ['model', 'messages', 'stream', 'stream_options'])

/** User-configured compatible bodies may contain additional safe JSON fields. */
export const OPENAI_COMPATIBLE_CHAT_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  messages: apiBodyArrayV2(message, { minItems: 1 }),
  stream: apiBodyBooleanV2(),
  temperature: number, top_p: number, top_k: integer, min_p: number, top_a: number, seed: integer,
  max_tokens: integer, max_completion_tokens: integer, stop: apiBodyUnionV2(string, apiBodyArrayV2(string)),
  tools: apiBodyArrayV2(functionTool), tool_choice: toolChoice, parallel_tool_calls: apiBodyBooleanV2(),
  stream_options: streamOptions, response_format: responseFormat,
}, ['model', 'messages', 'stream'], json)
