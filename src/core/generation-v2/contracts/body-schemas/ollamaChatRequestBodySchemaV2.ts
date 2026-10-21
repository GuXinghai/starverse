import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2, apiBodyUnionV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()

export const OLLAMA_CHAT_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  messages: apiBodyArrayV2(json, { minItems: 1 }),
  stream: apiBodyBooleanV2(),
  think: apiBodyUnionV2(apiBodyBooleanV2(), string),
  options: apiBodyObjectV2({ num_predict: integer, temperature: apiBodyNumberV2(), top_p: apiBodyNumberV2(),
    top_k: integer, seed: integer, stop: apiBodyArrayV2(string), repeat_penalty: apiBodyNumberV2() }, []),
}, ['model', 'messages', 'stream'])
