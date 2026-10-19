import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()
const toolChoice = apiBodyStringV2({ enum: ['none', 'required'] })

export const LMSTUDIO_OPENRESPONSES_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  input: apiBodyArrayV2(json, { minItems: 1 }),
  stream: apiBodyBooleanV2(), store: apiBodyBooleanV2(),
  temperature: apiBodyNumberV2(), top_p: apiBodyNumberV2(), max_output_tokens: integer,
  frequency_penalty: apiBodyNumberV2(), presence_penalty: apiBodyNumberV2(),
  reasoning: apiBodyObjectV2({ effort: string }, ['effort']),
  tools: apiBodyArrayV2(json, { minItems: 1 }),
  tool_choice: toolChoice,
}, ['model', 'input', 'stream', 'store'])
