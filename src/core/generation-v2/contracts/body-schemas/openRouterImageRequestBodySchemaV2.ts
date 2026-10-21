import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()

export const OPENROUTER_IMAGE_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  model: string,
  prompt: string,
  provider: apiBodyObjectV2({
    only: apiBodyArrayV2(string, { minItems: 1, maxItems: 1 }),
    allow_fallbacks: apiBodyBooleanV2(false),
    options: apiBodyObjectV2({}, [], json),
  }, ['only', 'allow_fallbacks']),
  stream: apiBodyBooleanV2(),
  seed: integer,
  n: integer,
  size: string,
  aspect_ratio: string,
  resolution: string,
  quality: string,
  output_format: string,
  background: string,
  output_compression: apiBodyNumberV2(),
  input_references: apiBodyArrayV2(json),
}, ['model', 'prompt', 'provider'])
