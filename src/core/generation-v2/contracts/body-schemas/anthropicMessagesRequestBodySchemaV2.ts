import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2, apiBodyUnionV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()
const message = apiBodyObjectV2({ role: apiBodyStringV2({ enum: ['user', 'assistant'] }),
  content: apiBodyUnionV2(string, apiBodyArrayV2(json, { minItems: 1 })) }, ['role', 'content'])
const toolChoice = apiBodyUnionV2(
  apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['auto', 'any', 'none'] }) }, ['type']),
  apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['tool'] }), name: string }, ['type', 'name']),
)

export const ANTHROPIC_MESSAGES_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  messages: apiBodyArrayV2(message, { minItems: 1 }),
  system: apiBodyUnionV2(string, apiBodyArrayV2(json, { minItems: 1 })),
  max_tokens: integer,
  stream: apiBodyBooleanV2(),
  temperature: apiBodyNumberV2(), top_p: apiBodyNumberV2(), top_k: integer,
  stop_sequences: apiBodyArrayV2(string),
  thinking: apiBodyUnionV2(
    apiBodyObjectV2({
      type: apiBodyStringV2({ enum: ['disabled', 'adaptive'] }),
      budget_tokens: integer,
      display: apiBodyStringV2({ enum: ['summarized', 'omitted'] }),
    }, ['type']),
    apiBodyObjectV2({
      type: apiBodyStringV2({ enum: ['enabled'] }),
      budget_tokens: integer,
      display: apiBodyStringV2({ enum: ['summarized', 'omitted'] }),
    }, ['type', 'budget_tokens']),
  ),
  output_config: apiBodyObjectV2({ effort: string }, ['effort']),
  tools: apiBodyArrayV2(json, { minItems: 1 }),
  tool_choice: toolChoice,
}, ['model', 'messages', 'max_tokens', 'stream'])
