import { contains, type ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import type { GenerationIntentLayerV2 } from '../../domain/generationIntentV2'
import type { RequestAdaptationV2 } from '../../compiler/requestAdaptationV2'

/** Interpreter for the documented native controls selected by a Rule. No model matching. */
export function executeGeminiReasoningRuleV2(requested: GenerationIntentLayerV2, capability: ResolvedCapabilityV2,
  protocol: 'generate_content' | 'interactions'): Readonly<{ reasoning: unknown; providerExtension: unknown; decisions: readonly RequestAdaptationV2[] }> {
  const fields = new Map(capability.modelFacts.fields.map(field => [field.path, field]))
  const mode = fields.get('reasoning.mode')
  const budget = fields.get('providerExtension.thinkingBudget')
  const level = fields.get('providerExtension.thinkingLevel')
  const known = (field: typeof budget, value: unknown) => field?.state === 'supported' && field.domain !== undefined && contains(field.domain, value)
  const required = mode?.state === 'supported' && mode.domain?.kind === 'enum' &&
    mode.domain.values.includes('enabled') && !mode.domain.values.includes('disabled')
  const source = requested.providerExtension?.kind === (protocol === 'generate_content' ? 'gemini_generate_content' : 'gemini_interactions')
    ? requested.providerExtension : undefined
  const ext = { ...(source ?? {}), kind: protocol === 'generate_content' ? 'gemini_generate_content' : 'gemini_interactions' } as Record<string, unknown>
  const decisions: RequestAdaptationV2[] = []
  const decision = (path: string, reason: string, value?: unknown) => decisions.push({ path, outcome: 'converted', reason,
    ...(value === undefined ? {} : { source: value }) })
  const off = requested.reasoning?.mode === 'disabled' || ext.thinkingMode === 'budget' && ext.thinkingBudget === 0
  const documentedEnabledDefault = mode?.state === 'supported' && (mode.defaultValue === 'enabled' || required)
  if (mode?.state === 'unsupported') {
    decision('reasoning.mode', 'target_thinking_unsupported', requested.reasoning)
    if (protocol === 'generate_content') { ext.thinkingMode = 'default'; ext.includeThoughts = 'provider_default' }
    delete ext.thinkingBudget; delete ext.thinkingLevel
    return { reasoning: { mode: 'disabled' }, providerExtension: ext, decisions }
  }
  if (protocol === 'interactions') {
    const value = ext.thinkingLevel ?? (requested.reasoning?.mode === 'enabled' ? requested.reasoning.effort : undefined)
    if (off && !required || !known(level, value) && !documentedEnabledDefault) {
      throw new Error('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
    }
    if (known(level, value)) ext.thinkingLevel = value
    else { if (value !== undefined) decision('providerExtension.thinkingLevel', 'target_native_thinking_control_provider_default', value); delete ext.thinkingLevel }
    if (off) decision('reasoning.mode', required ? 'target_thinking_required' : 'target_off_control_unknown_provider_default')
    return { reasoning: { mode: 'enabled' }, providerExtension: ext, decisions }
  }
  ext.includeThoughts ??= 'provider_default'
  if (off && !required && known(budget, 0)) {
    ext.thinkingMode = 'budget'; ext.thinkingBudget = 0; delete ext.thinkingLevel
    return { reasoning: { mode: 'disabled' }, providerExtension: ext, decisions }
  }
  if (off && !required) throw new Error('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
  if (off) decision('reasoning.mode', required ? 'target_thinking_required' : 'target_off_control_unknown_provider_default', requested.reasoning)
  const legalBudget = ext.thinkingMode === 'budget' && known(budget, ext.thinkingBudget) && ext.thinkingBudget !== 0
  const legalLevel = ext.thinkingMode === 'level' && known(level, ext.thinkingLevel)
  if (!legalBudget && !legalLevel) {
    if (ext.thinkingMode !== 'default') decision('providerExtension', 'target_native_thinking_control_provider_default', ext)
    ext.thinkingMode = 'default'; delete ext.thinkingBudget; delete ext.thinkingLevel
    const effort = requested.reasoning?.mode === 'enabled' ? requested.reasoning.effort : undefined
    if (!off && known(level, effort)) {
      ext.thinkingMode = 'level'; ext.thinkingLevel = effort
      decision('reasoning.effort', 'target_documented_native_level', effort)
    } else if (effort !== undefined) decision('reasoning.effort', 'target_has_no_equivalent_effort_provider_default', effort)
  }
  if (ext.thinkingMode === 'default' && !documentedEnabledDefault) {
    throw new Error('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
  }
  return { reasoning: { mode: 'enabled' }, providerExtension: ext, decisions }
}
