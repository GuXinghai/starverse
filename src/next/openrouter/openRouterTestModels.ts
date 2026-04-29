export const OPENROUTER_TEST_MODELS = [
  'deepseek/deepseek-v4-flash',
  'google/gemma-4-26b-a4b-it',
  'qwen/qwen3.6-flash',
] as const

export type OpenRouterTestModel = (typeof OPENROUTER_TEST_MODELS)[number]

export const DEFAULT_OPENROUTER_TEST_MODEL: OpenRouterTestModel = OPENROUTER_TEST_MODELS[0]

export function isOpenRouterTestModel(model: string): model is OpenRouterTestModel {
  return (OPENROUTER_TEST_MODELS as readonly string[]).includes(model)
}

export function assertOpenRouterTestModel(model: string): asserts model is OpenRouterTestModel {
  if (!isOpenRouterTestModel(model)) {
    throw new Error(`OpenRouter test model must be declared in OPENROUTER_TEST_MODELS: ${model}`)
  }
}