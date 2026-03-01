export type OpenRouterSamplingParamName =
  | 'temperature'
  | 'top_p'
  | 'top_k'
  | 'min_p'
  | 'top_a'
  | 'frequency_penalty'
  | 'presence_penalty'
  | 'repetition_penalty'
  | 'seed'
  | 'max_tokens'

export type OpenRouterSamplingParamNumberType = 'float' | 'int'

export type OpenRouterSamplingParamSpec = Readonly<{
  key: OpenRouterSamplingParamName
  label: string
  description: string
  type: OpenRouterSamplingParamNumberType
  min?: number
  max?: number
  defaultValue?: number
  step: number
}>

export const OPENROUTER_SAMPLING_PARAM_SPECS: ReadonlyArray<OpenRouterSamplingParamSpec> = [
  {
    key: 'temperature',
    label: 'temperature',
    description: 'Randomness. Higher is more creative.',
    type: 'float',
    min: 0,
    max: 2,
    defaultValue: 1,
    step: 0.01,
  },
  {
    key: 'top_p',
    label: 'top_p',
    description: 'Nucleus sampling threshold.',
    type: 'float',
    min: 0,
    max: 1,
    defaultValue: 1,
    step: 0.01,
  },
  {
    key: 'top_k',
    label: 'top_k',
    description: 'Limit token candidates to top-k.',
    type: 'int',
    min: 0,
    defaultValue: 0,
    step: 1,
  },
  {
    key: 'min_p',
    label: 'min_p',
    description: 'Minimum token probability filter.',
    type: 'float',
    min: 0,
    max: 1,
    defaultValue: 0,
    step: 0.01,
  },
  {
    key: 'top_a',
    label: 'top_a',
    description: 'Adaptive threshold sampling.',
    type: 'float',
    min: 0,
    max: 1,
    defaultValue: 0,
    step: 0.01,
  },
  {
    key: 'frequency_penalty',
    label: 'frequency_penalty',
    description: 'Penalize token frequency repetition.',
    type: 'float',
    min: -2,
    max: 2,
    defaultValue: 0,
    step: 0.01,
  },
  {
    key: 'presence_penalty',
    label: 'presence_penalty',
    description: 'Penalize already-present topics.',
    type: 'float',
    min: -2,
    max: 2,
    defaultValue: 0,
    step: 0.01,
  },
  {
    key: 'repetition_penalty',
    label: 'repetition_penalty',
    description: 'Scale down repeated token likelihood.',
    type: 'float',
    min: 0,
    max: 2,
    defaultValue: 1,
    step: 0.01,
  },
  {
    key: 'seed',
    label: 'seed',
    description: 'Best-effort reproducibility seed.',
    type: 'int',
    min: 0,
    step: 1,
  },
  {
    key: 'max_tokens',
    label: 'max_tokens',
    description: 'Maximum output tokens.',
    type: 'int',
    min: 1,
    step: 1,
  },
]

export const OPENROUTER_SAMPLING_PARAM_KEYS: ReadonlyArray<OpenRouterSamplingParamName> =
  OPENROUTER_SAMPLING_PARAM_SPECS.map((row) => row.key)

export const OPENROUTER_SAMPLING_PARAM_SPEC_MAP: Readonly<Record<OpenRouterSamplingParamName, OpenRouterSamplingParamSpec>> =
  Object.freeze(
    Object.fromEntries(
      OPENROUTER_SAMPLING_PARAM_SPECS.map((row) => [row.key, row])
    ) as Record<OpenRouterSamplingParamName, OpenRouterSamplingParamSpec>
  )
