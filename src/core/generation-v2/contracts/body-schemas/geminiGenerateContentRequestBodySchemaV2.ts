import { apiBodyArrayV2, apiBodyBooleanV2, apiBodyJsonV2, apiBodyNumberV2, apiBodyObjectV2,
  apiBodyStringV2 } from '../apiRequestBodySchemaV2'

const string = apiBodyStringV2()
const integer = apiBodyNumberV2(true)
const json = apiBodyJsonV2()
const content = apiBodyObjectV2({ role: apiBodyStringV2({ enum: ['user', 'model'] }), parts: apiBodyArrayV2(json, { minItems: 1 }) }, ['role', 'parts'])
const generationConfig = apiBodyObjectV2({
  temperature: apiBodyNumberV2(), topP: apiBodyNumberV2(), topK: integer, maxOutputTokens: integer,
  stopSequences: apiBodyArrayV2(string), presencePenalty: apiBodyNumberV2(), frequencyPenalty: apiBodyNumberV2(),
  seed: integer,
  responseMimeType: apiBodyStringV2({ enum: ['text/plain', 'application/json'] }),
  thinkingConfig: apiBodyObjectV2({ thinkingBudget: integer, thinkingLevel: string, includeThoughts: apiBodyBooleanV2() }, []),
}, [])

export const GEMINI_GENERATE_CONTENT_REQUEST_BODY_SCHEMA_V2 = apiBodyObjectV2({
  contents: apiBodyArrayV2(content, { minItems: 1 }),
  systemInstruction: apiBodyObjectV2({ parts: apiBodyArrayV2(apiBodyObjectV2({ text: string }, ['text']), { minItems: 1 }) }, ['parts']),
  generationConfig,
  tools: apiBodyArrayV2(json),
  toolConfig: apiBodyObjectV2({ functionCallingConfig: apiBodyObjectV2({
    mode: apiBodyStringV2({ enum: ['AUTO', 'NONE', 'ANY'] }), allowedFunctionNames: apiBodyArrayV2(string),
  }, ['mode']) }, ['functionCallingConfig']),
}, ['contents', 'generationConfig'])
