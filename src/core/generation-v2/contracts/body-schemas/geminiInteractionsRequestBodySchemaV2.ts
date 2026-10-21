import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2, apiBodyUnionV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const image = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['image'] }), mime_type: apiBodyStringV2({ enum: ['image/jpeg'] }),
  aspect_ratio: string, image_size: apiBodyStringV2({ enum: ['512', '1K', '2K', '4K'] }) }, ['type'])
const text = apiBodyObjectV2({ type: apiBodyStringV2({ enum: ['text'] }) }, ['type'])
const imageResponseFormat = apiBodyUnionV2(image, apiBodyArrayV2(apiBodyUnionV2(text, image), { minItems: 2, maxItems: 2 }))

export const GEMINI_INTERACTIONS_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  input: string,
  response_format: imageResponseFormat,
  stream: apiBodyBooleanV2(),
  store: apiBodyBooleanV2(),
  generation_config: apiBodyObjectV2({ temperature: apiBodyNumberV2(), top_p: apiBodyNumberV2(),
    max_output_tokens: integer, stop_sequences: apiBodyArrayV2(string), thinking_level: string,
    thinking_summaries: apiBodyStringV2({ enum: ['auto'] }) }, []),
  tools: apiBodyArrayV2(apiBodyJsonV2()),
}, ['model', 'input', 'response_format', 'stream', 'store'])
