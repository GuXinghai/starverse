import {
  apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2, apiBodyUnionV2, type ApiRequestBodySchemaNodeV2,
} from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const number = apiBodyNumberV2()
const json = apiBodyJsonV2()

const functionTool = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['function'] }), name: string, description: string,
  parameters: json, strict: apiBodyBooleanV2() }, ['type', 'name', 'parameters', 'strict'])
const webSearchTool = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['web_search'] }), search_context_size: string,
  filters: apiBodyObjectV2({ allowed_domains: apiBodyArrayV2(string) }, ['allowed_domains']) }, ['type'])
const imageTool = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['image_generation'] }),
  action: apiBodyStringV2({ enum: ['auto', 'generate', 'edit'] }),
  size: apiBodyStringV2({ enum: ['auto', '1024x1024', '1024x1536', '1536x1024'] }), quality: string,
  output_format: apiBodyStringV2({ enum: ['png', 'jpeg', 'webp'] }),
  background: apiBodyStringV2({ enum: ['auto', 'transparent', 'opaque'] }), partial_images: integer }, ['type'])
const tool = apiBodyUnionV2(functionTool, webSearchTool, imageTool)

export const OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2: ApiRequestBodySchemaNodeV2 = apiBodyObjectV2({
  model: string,
  input: apiBodyArrayV2(json, { minItems: 1 }),
  stream: apiBodyBooleanV2(), store: apiBodyBooleanV2(),
  include: apiBodyArrayV2(apiBodyStringV2({ enum: ['reasoning.encrypted_content'] }), { minItems: 1 }),
  instructions: string,
  reasoning: apiBodyObjectV2({ effort: string, summary: string,
    mode: apiBodyStringV2({ enum: ['standard', 'pro'] }),
    context: apiBodyStringV2({ enum: ['auto', 'current_turn', 'all_turns'] }) }, []),
  temperature: number, top_p: number, max_output_tokens: integer,
  text: apiBodyObjectV2({ verbosity: string }, ['verbosity']),
  tools: apiBodyArrayV2(tool, { minItems: 1 }),
  tool_choice: apiBodyUnionV2(apiBodyStringV2({ enum: ['none', 'auto', 'required'] }),
    apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['function'] }), name: string }, ['type', 'name'])),
  max_tool_calls: integer, parallel_tool_calls: apiBodyBooleanV2(),
  service_tier: apiBodyStringV2({ enum: ['auto', 'default', 'flex', 'priority'] }),
}, ['model', 'input', 'stream', 'store', 'include'])
