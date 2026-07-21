import type { ResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import { resolveAnthropicModelThinkingRuleV1 } from './modelThinkingRulesV1'

export type AnthropicThinkingDisplayIntentProjectionIssueV1 = Readonly<{
  semanticPath:
    | 'modelId'
    | 'reasoning.mode'
    | 'providerExtension.kind'
    | 'providerExtension.thinkingDisplay'
    | 'providerExtension.thinkingMode'
    | 'providerExtension.manualThinkingBudgetTokens'
  code:
    | 'ANTHROPIC_MODEL_RULE_UNAVAILABLE'
    | 'ANTHROPIC_THINKING_DISABLED_UNSUPPORTED'
    | 'ANTHROPIC_PROVIDER_EXTENSION_UNSUPPORTED'
    | 'ANTHROPIC_THINKING_MODE_RECOMMENDATION_UNAVAILABLE'
    | 'ANTHROPIC_THINKING_MODE_UNSUPPORTED'
    | 'ANTHROPIC_MANUAL_THINKING_BUDGET_REQUIRED'
}>

export type AnthropicThinkingDisplayIntentDispositionV1 = Readonly<{
  semanticPath: AnthropicThinkingDisplayIntentProjectionIssueV1['semanticPath']
  outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
  wireKey?: 'thinking.type' | 'thinking.budget_tokens' | 'thinking.display'
  value?: 'enabled' | 'adaptive' | 'disabled' | 'summarized' | 'omitted' | number
  code?: AnthropicThinkingDisplayIntentProjectionIssueV1['code']
}>

export type AnthropicThinkingDisplayIntentProjectionV1 = Readonly<{
  thinking?: Readonly<{
    type: 'enabled' | 'adaptive' | 'disabled'
    budgetTokens?: number
    display?: 'summarized' | 'omitted'
  }>
  dispositions: readonly AnthropicThinkingDisplayIntentDispositionV1[]
  issues: readonly AnthropicThinkingDisplayIntentProjectionIssueV1[]
}>

/**
 * Resolves the complete V2 thinking fragment from the immutable intent and
 * reviewed, exact model rule. It intentionally cannot consult UI state or
 * synthesize a display value when the user selected provider_default.
 */
export function projectAnthropicThinkingDisplayIntentV1(
  intent: ResolvedGenerationIntentV2,
  modelId: string,
): AnthropicThinkingDisplayIntentProjectionV1 {
  const dispositions: AnthropicThinkingDisplayIntentDispositionV1[] = []
  const issues: AnthropicThinkingDisplayIntentProjectionIssueV1[] = []
  const acceptNoWire = (semanticPath: AnthropicThinkingDisplayIntentDispositionV1['semanticPath']) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire' }))
  }
  const reject = (
    semanticPath: AnthropicThinkingDisplayIntentProjectionIssueV1['semanticPath'],
    code: AnthropicThinkingDisplayIntentProjectionIssueV1['code'],
  ) => {
    const issue = Object.freeze({ semanticPath, code })
    issues.push(issue)
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected', code }))
  }

  const modelRule = resolveAnthropicModelThinkingRuleV1(modelId)
  if (!modelRule) {
    reject('modelId', 'ANTHROPIC_MODEL_RULE_UNAVAILABLE')
    return Object.freeze({
      dispositions: Object.freeze(dispositions),
      issues: Object.freeze(issues),
    })
  }
  if (intent.reasoning.mode === 'disabled' && !modelRule.thinkingModes.includes('disabled')) {
    reject('reasoning.mode', 'ANTHROPIC_THINKING_DISABLED_UNSUPPORTED')
  }

  if (intent.providerExtension.kind === 'none') {
    reject('providerExtension.kind', 'ANTHROPIC_PROVIDER_EXTENSION_UNSUPPORTED')
  } else if (intent.providerExtension.kind !== 'anthropic_messages') {
    reject('providerExtension.kind', 'ANTHROPIC_PROVIDER_EXTENSION_UNSUPPORTED')
  } else if (intent.reasoning.mode === 'disabled') {
    // The UI disables this control with thinking disabled. Preserve its saved
    // setting in the immutable intent, but record that it has no wire effect.
    acceptNoWire('providerExtension.kind')
    acceptNoWire('providerExtension.thinkingDisplay')
    acceptNoWire('providerExtension.thinkingMode')
    if (intent.providerExtension.manualThinkingBudgetTokens !== undefined) {
      acceptNoWire('providerExtension.manualThinkingBudgetTokens')
    }
  } else {
    acceptNoWire('providerExtension.kind')
    const requestedThinkingMode = intent.providerExtension.thinkingMode === 'model_recommended'
      ? modelRule.recommendedEnabledThinkingMode
      : intent.providerExtension.thinkingMode
    if (requestedThinkingMode === null) {
      reject('providerExtension.thinkingMode', 'ANTHROPIC_THINKING_MODE_RECOMMENDATION_UNAVAILABLE')
    } else if (!modelRule.thinkingModes.includes(requestedThinkingMode)) {
      reject('providerExtension.thinkingMode', 'ANTHROPIC_THINKING_MODE_UNSUPPORTED')
    } else {
      dispositions.push(Object.freeze({
        semanticPath: 'providerExtension.thinkingMode', outcome: 'encoded', wireKey: 'thinking.type',
        value: requestedThinkingMode === 'manual' ? 'enabled' : 'adaptive',
      }))
      if (requestedThinkingMode === 'manual') {
        const budgetTokens = intent.providerExtension.manualThinkingBudgetTokens
        if (budgetTokens === undefined) {
          reject('providerExtension.manualThinkingBudgetTokens', 'ANTHROPIC_MANUAL_THINKING_BUDGET_REQUIRED')
        } else {
          dispositions.push(Object.freeze({
            semanticPath: 'providerExtension.manualThinkingBudgetTokens', outcome: 'encoded',
            wireKey: 'thinking.budget_tokens', value: budgetTokens,
          }))
        }
      }
    }
    if (intent.providerExtension.thinkingDisplay === 'provider_default') {
      acceptNoWire('providerExtension.thinkingDisplay')
    } else {
      dispositions.push(Object.freeze({
        semanticPath: 'providerExtension.thinkingDisplay',
        outcome: 'encoded', wireKey: 'thinking.display', value: intent.providerExtension.thinkingDisplay,
      }))
    }
  }
  dispositions.sort((left, right) => left.semanticPath < right.semanticPath ? -1 : left.semanticPath > right.semanticPath ? 1 : 0)
  issues.sort((left, right) => left.semanticPath < right.semanticPath ? -1 : left.semanticPath > right.semanticPath ? 1 : 0)
  if (new Set(dispositions.map((entry) => entry.semanticPath)).size !== dispositions.length) {
    throw new Error('GENERATION_V2_ANTHROPIC_DUPLICATE_SEMANTIC_PATH')
  }
  const providerExtension = intent.providerExtension.kind === 'anthropic_messages'
    ? intent.providerExtension
    : null
  const requestedThinkingMode = providerExtension?.thinkingMode === 'model_recommended'
    ? modelRule.recommendedEnabledThinkingMode
    : providerExtension?.thinkingMode
  const manualBudgetTokens = providerExtension?.manualThinkingBudgetTokens
  const canEmitThinking = issues.length === 0 && providerExtension !== null
  const display = providerExtension?.thinkingDisplay === 'provider_default'
    ? undefined
    : providerExtension?.thinkingDisplay
  return Object.freeze({
    ...(canEmitThinking
      ? intent.reasoning.mode === 'disabled'
        ? { thinking: Object.freeze({ type: 'disabled' as const }) }
        : requestedThinkingMode === 'manual' && manualBudgetTokens !== undefined
          ? { thinking: Object.freeze({ type: 'enabled' as const, budgetTokens: manualBudgetTokens, ...(display === undefined ? {} : { display }) }) }
          : requestedThinkingMode === 'adaptive'
            ? { thinking: Object.freeze({ type: 'adaptive' as const, ...(display === undefined ? {} : { display }) }) }
            : {}
      : {}),
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  })
}
