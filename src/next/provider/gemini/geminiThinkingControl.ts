/** UI shape mechanically projected from canonical Generation V2 capability fields. */
export type GeminiThinkingLevel = string

export type GeminiThinkingCapability = Readonly<{
  modelId: string
  thinkingOwnProperty: boolean
  thinkingRawValue: unknown
  thinkingRawType: string
  matchedRule: string | null
  allowDynamic: boolean
  allowOff: boolean
}> & (
  | Readonly<{ thinkingSupported: 'unsupported'; kind: 'unsupported'; controlKind: null; reason: string }>
  | Readonly<{ thinkingSupported: 'supported'; kind: 'level'; controlKind: 'level'; levels: readonly string[];
      defaultLevel: string; highIsDynamic: true; reason: 'mapped_level' }>
  | Readonly<{ thinkingSupported: 'supported'; kind: 'budget'; controlKind: 'budget'; minBudget: number;
      maxBudget: number; defaultBudgetMode: 'dynamic' | 'off'; reason: 'mapped_budget' }>
  | Readonly<{ thinkingSupported: 'supported'; kind: 'default-only'; controlKind: 'default-only';
      reason: 'supported_unmapped' }>
)
