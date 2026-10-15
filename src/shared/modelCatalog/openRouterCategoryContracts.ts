export const OPENROUTER_MODEL_CATEGORIES = [
  'programming',
  'roleplay',
  'marketing',
  'marketing/seo',
  'technology',
  'science',
  'translation',
  'legal',
  'finance',
  'health',
  'trivia',
  'academia',
] as const

export type OpenRouterModelCategory = (typeof OPENROUTER_MODEL_CATEGORIES)[number]
