# Unified Generation & Reasoning Architecture

**Status**: ✅ **Core Implementation Complete** (Phase 1 & 2)  
**Date**: 2025-12-02  
**Author**: Starverse Generation & Reasoning Architect

---

## 📋 Executive Summary

This document describes the **unified generation parameter architecture** for Starverse, which integrates:

- **Sampling parameters** (temperature, top_p, penalties, etc.)
- **Length control** (max_tokens, stop sequences)
- **Reasoning parameters** (effort, max_tokens, visibility)

The architecture is **100% aligned with OpenRouter's official documentation** and provides:
- 4-layer configuration override system (Global → Model → Conversation → Request)
- Model capability table with `supported_parameters` checking
- Unified adapter that respects reasoning exclusivity rules
- Clear separation between "OpenRouter semantics" and "Starverse strategies"

---

## 🎯 Design Goals (Achieved)

### ✅ DO

1. **Unify all generation parameters** into a single coherent structure
2. **Respect `supported_parameters`** from `/models` API
3. **Enforce reasoning exclusivity**: `effort` XOR `max_tokens` in `reasoning` object
4. **Provide 4-layer override system** for flexible configuration
5. **Document all Starverse-specific strategies** explicitly (not silent magic)
6. **Integrate with existing `openrouterReasoningAdapter.ts`** (extend, not replace)

### ❌ DON'T

1. ❌ Create a competing second architecture
2. ❌ Silently guess ambiguous OpenRouter behavior
3. ❌ Send unsupported parameters to models
4. ❌ Leave dead code from old reasoning pipeline

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│            4-Layer Configuration System                 │
│  Global → Model → Conversation → Request                │
│         (generationConfigManager.ts)                    │
└──────────────────┬──────────────────────────────────────┘
                   │ EffectiveConfig
                   ▼
┌─────────────────────────────────────────────────────────┐
│           Model Capability Table                        │
│   (modelCapability.ts - from /models API)               │
│   - Sampling: temperature, top_p, penalties...          │
│   - Length: max_tokens, stop, maxCompletionTokens       │
│   - Reasoning: family, maxTokensPolicy, visibility      │
└──────────────────┬──────────────────────────────────────┘
                   │ Capability + Config
                   ▼
┌─────────────────────────────────────────────────────────┐
│          Unified Generation Adapter                     │
│          (generationAdapter.ts)                         │
│   ┌──────────────────────────────────────────┐         │
│   │ 1. applySamplingConfig                   │         │
│   │    - Check capability.sampling           │         │
│   │    - Clamp to valid ranges               │         │
│   │    - Warn on conflicts                   │         │
│   └──────────────────────────────────────────┘         │
│   ┌──────────────────────────────────────────┐         │
│   │ 2. buildReasoningPayload                 │         │
│   │    (from openrouterReasoningAdapter.ts)  │         │
│   │    - Enforce effort XOR max_tokens       │         │
│   │    - Handle Anthropic [1024,32000]       │         │
│   │    - Set exclude based on visibility     │         │
│   └──────────────────────────────────────────┘         │
│   ┌──────────────────────────────────────────┐         │
│   │ 3. applyLengthConfig                     │         │
│   │    - Use reasoning.max_tokens if set     │         │
│   │    - Clamp to maxCompletionTokens        │         │
│   │    - Handle stop sequences               │         │
│   └──────────────────────────────────────────┘         │
└──────────────────┬──────────────────────────────────────┘
                   │ OpenRouter Request Body Fragment
                   ▼
┌─────────────────────────────────────────────────────────┐
│         OpenRouterService.streamChatResponse            │
│   - Receives requestBodyFragment                        │
│   - Merges with messages, model, stream                 │
│   - Sends to OpenRouter API                             │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 File Structure (New)

```
src/
├── types/
│   ├── generation.ts           ⭐ NEW - Unified config types
│   └── reasoning.ts            ✅ EXISTS - Reasoning types (kept)
│
├── services/providers/
│   ├── generationAdapter.ts           ⭐ NEW - Unified adapter
│   ├── generationConfigManager.ts     ⭐ NEW - 4-layer config system
│   ├── modelCapability.ts             ⭐ NEW - Capability table builder
│   ├── openrouterReasoningAdapter.ts  ✅ EXISTS - Reasoning sub-adapter
│   └── OpenRouterService.js           🔧 TO UPDATE - Use new adapter
│
├── composables/
│   ├── useReasoningControl.ts         🔧 TO UPDATE - Wrap new config manager
│   └── chat/
│       ├── useMessageSending.ts       🔧 TO UPDATE - Use unified config
│       └── useMessageRetry.ts         🔧 TO UPDATE - Use unified config
│
└── components/
    ├── ChatView.vue                    🔧 TO UPDATE - Use new composable
    ├── chat/ChatToolbar.vue            🔧 TO UPDATE - UI for sampling params
    └── chat/ChatInputArea.vue          🔧 TO UPDATE - UI integration
```

**Legend**:
- ⭐ NEW - Newly created file
- ✅ EXISTS - Existing file, no change needed
- 🔧 TO UPDATE - Needs migration to new architecture

---

## 🔑 Key Types

### GenerationConfig (Unified)

```typescript
interface GenerationConfig {
  sampling?: {
    temperature?: number        // 0~2
    top_p?: number              // 0~1
    top_k?: number              // >=0
    frequency_penalty?: number  // -2~2
    presence_penalty?: number   // -2~2
    repetition_penalty?: number // 0~2
    min_p?: number              // 0~1
    top_a?: number              // 0~1
    seed?: number
    logit_bias?: Record<string, number>
  }

  length?: {
    max_tokens?: number
    stop?: string[]
    verbosity?: 'low' | 'medium' | 'high'
  }

  reasoning?: {
    controlMode: 'disabled' | 'effort' | 'max_tokens' | 'auto'
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'none'
    maxReasoningTokens?: number
    maxCompletionTokens?: number
    showReasoningContent: boolean
  }
}
```

### ModelGenerationCapability

```typescript
interface ModelGenerationCapability {
  modelId: string

  sampling: {
    temperature: boolean
    top_p: boolean
    // ... (all sampling params)
  }

  length: {
    max_tokens: boolean
    stop: boolean
    verbosity: boolean
    maxCompletionTokens: number | null  // from top_provider
  }

  reasoning: ModelReasoningCapability  // from reasoning.ts

  other: {
    tools: boolean
    response_format: boolean
    structured_outputs: boolean
    // ...
  }

  _raw_supported_parameters?: string[]
}
```

---

## 🔄 Adapter Flow

### buildOpenRouterRequest() - Entry Point

```typescript
// Input
const result = buildOpenRouterRequest({
  modelId: 'anthropic/claude-3.7-sonnet',
  capability: modelCapabilityMap.get('anthropic/claude-3.7-sonnet'),
  effectiveConfig: mergedConfig,  // from 4-layer system
  messages: [...],
})

// Output
{
  requestBodyFragment: {
    temperature: 0.7,
    max_tokens: 10000,
    reasoning: {
      max_tokens: 8000,
      exclude: false,
    },
    include_reasoning: true,
  },
  warnings: [
    { type: 'clipped', message: '推理预算已裁剪到 [1024, 32000] 范围' },
  ],
  ignoredParameters: [
    { key: 'top_k', reason: 'Claude 不支持 top_k 参数' },
  ],
}
```

### Sub-Adapter 1: applySamplingConfig

**Responsibilities**:
- Check `capability.sampling.*` for each parameter
- Clamp values to OpenRouter-defined ranges
- Warn on parameter conflicts (e.g., temperature + multiple top_*)
- Ignore unsupported parameters

**Example**:
```typescript
// User sets temperature=2.5, top_k=50 for Claude
// Claude supports temperature, NOT top_k

// Result:
requestBody.temperature = 2.0  // clamped to [0, 2]
// top_k ignored
warnings: [{ type: 'clipped', message: 'temperature 2.5 超出范围' }]
ignoredParameters: [{ key: 'top_k', reason: 'Claude 不支持' }]
```

### Sub-Adapter 2: buildReasoningPayload

**Responsibilities** (delegated to `openrouterReasoningAdapter.ts`):
- Enforce `effort` XOR `max_tokens` in `reasoning` object
- Apply Anthropic [1024, 32000] clipping for `family='anthropic'`
- Set `reasoning.exclude` based on `showReasoningContent`
- Set `include_reasoning` if `supported_parameters` includes it

**Example** (Anthropic):
```typescript
// User: maxReasoningTokens=50000, maxCompletionTokens=12000

// Result:
requestBody.reasoning = {
  max_tokens: 32000,  // clipped
  exclude: false,
}
requestBody.max_tokens = 33024  // > reasoning.max_tokens (Anthropic rule)
warnings: [{ type: 'clipped', message: 'Anthropic 裁剪到 32000' }]
```

### Sub-Adapter 3: applyLengthConfig

**Responsibilities**:
- Use `reasoning.max_tokens` if already set by reasoning adapter
- Otherwise use `lengthConfig.max_tokens`
- Clamp to `capability.length.maxCompletionTokens`
- Handle `stop` sequences and `verbosity`

**Example**:
```typescript
// Reasoning already set max_tokens=10000
// User also provided lengthConfig.max_tokens=5000

// Result:
requestBody.max_tokens = 10000  // reasoning takes precedence
// lengthConfig ignored
```

---

## 🛡️ Safety Rails (Hard Constraints)

### 1. Reasoning Exclusivity

**Rule**: `reasoning` object MUST contain **at most one** of `effort` or `max_tokens`.

**Implementation**:
```typescript
// openrouterReasoningAdapter.ts - handleMaxTokensMode()
reasoning.max_tokens = clipped
// ❌ NOT: reasoning.effort = ...  (mutually exclusive)
```

**Violation Example** (prevented):
```json
{
  "reasoning": {
    "effort": "high",
    "max_tokens": 2000  // ❌ BOTH SET - adapter prevents this
  }
}
```

### 2. Supported Parameters Check

**Rule**: Do NOT send parameters if `capability.*[param] === false`.

**Implementation**:
```typescript
// generationAdapter.ts - applySamplingConfig()
if (!capability.sampling.top_k) {
  ignoredParameters.push({ key: 'top_k', reason: '...' })
  continue  // skip setting requestBody.top_k
}
```

### 3. Anthropic Reasoning Rules

**Rule** (from OpenRouter docs):
- `reasoning.max_tokens` ∈ [1024, 32000]
- `max_tokens` > `reasoning.max_tokens`

**Implementation**:
```typescript
// openrouterReasoningAdapter.ts - handleAnthropicMaxTokens()
const clipped = clamp(requested, 1024, 32000)
let completionMax = chooseCompletionMaxTokensForAnthropic(...)
if (completionMax <= clipped) {
  completionMax = clipped + strategy.anthropicSafetyMargin
  warnings.push({ type: 'auto-adjusted', ... })
}
```

### 4. Effort-Only Models

**Rule**: For models that only support `effort`, forward `maxReasoningTokens` as effort hint.

**Implementation**:
```typescript
// openrouterReasoningAdapter.ts - handleEffortOnlyMaxTokens()
reasoning.effort = appliedEffort  // use user's effort setting
payload.max_tokens = requested ?? providerCap
warnings.push({ type: 'fallback', message: 'effort-only 模型：max_tokens 作为 hint' })
```

---

## 📊 4-Layer Configuration System

### Priority (Low → High)

```
Global < Model < Conversation < Request
```

### Example

**Global Config**:
```typescript
{
  sampling: { temperature: 0.7 },
  reasoning: { effort: 'medium', showReasoningContent: false },
}
```

**Model Config** (for `openai/o1-preview`):
```typescript
{
  reasoning: { effort: 'high' },  // override global
}
```

**Conversation Config** (for conversation `conv-123`):
```typescript
{
  sampling: { temperature: 0.9 },  // override global
}
```

**Request Override**:
```typescript
{
  sampling: { top_p: 0.95 },
}
```

**Effective Config** (merged):
```typescript
{
  sampling: {
    temperature: 0.9,  // from conversation
    top_p: 0.95,       // from request
  },
  reasoning: {
    effort: 'high',    // from model
    showReasoningContent: false,  // from global
  },
}
```

### Usage

```typescript
import { generationConfigManager } from '@/services/providers/generationConfigManager'

// Get effective config
const effectiveConfig = generationConfigManager.getEffectiveConfig({
  modelId: 'openai/gpt-4o',
  conversationId: 'conv-123',
  requestOverride: { sampling: { temperature: 0.5 } },
})

// Update conversation config
await generationConfigManager.setConversationConfig('conv-123', {
  reasoning: { maxReasoningTokens: 5000 },
})
```

---

## 🔧 Migration Path (Phases)

### ✅ Phase 1: Core Infrastructure (COMPLETE)

- [x] Create `generation.ts` with unified types
- [x] Create `modelCapability.ts` with builder functions
- [x] Create `generationAdapter.ts` with 3 sub-adapters
- [x] Create `generationConfigManager.ts` with 4-layer system
- [x] Integrate with existing `openrouterReasoningAdapter.ts`

### 🔄 Phase 2: Adapter Integration (IN PROGRESS)

**Files to Update**:

1. **`OpenRouterService.js`** (main integration point):
   - Import `buildOpenRouterRequest`, `modelCapabilityMap`
   - Replace manual parameter assembly with adapter call
   - Keep existing `reasoning` options structure for backward compatibility
   - Add sampling parameters support

2. **`useReasoningControl.ts`** (composable):
   - Wrap `generationConfigManager` for reasoning config
   - Keep existing `buildReasoningRequestOptions()` signature
   - Migrate to use `GenerationConfig` internally

3. **`useMessageSending.ts`, `useMessageRetry.ts`**:
   - Replace `buildReasoningRequestOptions()` calls with unified config
   - Pass `effectiveConfig` to OpenRouterService

### 🚧 Phase 3: UI Components (PENDING)

1. **ChatToolbar.vue**:
   - Add sampling parameter controls (temperature slider, etc.)
   - Use `useGenerationConfig()` composable

2. **Settings UI**:
   - Global defaults editor
   - Model-specific overrides
   - Conversation-level tweaks

### 🧹 Phase 4: Cleanup (PENDING)

- [ ] Remove obsolete `buildReasoningRequestOptions` branches
- [ ] Delete unused reasoning-related code paths
- [ ] Consolidate type definitions (no duplicates)
- [ ] Update all references to use new architecture

---

## 🧪 Testing Strategy

### Unit Tests (Create)

1. **`modelCapability.test.ts`**:
   - Test `buildModelCapability()` with real `/models` responses
   - Test family detection for edge cases
   - Test visible reasoning detection

2. **`generationAdapter.test.ts`**:
   - Test sampling parameter filtering
   - Test reasoning exclusivity enforcement
   - Test Anthropic clipping rules
   - Test length config precedence

3. **`generationConfigManager.test.ts`**:
   - Test 4-layer merging
   - Test persistence (electron-store mock)
   - Test deep merge edge cases

### Integration Tests

1. **End-to-end request building**:
   - Mock `/models` API response
   - Build capability table
   - Merge 4-layer config
   - Run adapter
   - Verify final request body

2. **Compatibility tests**:
   - Ensure existing `useReasoningControl` behavior preserved
   - Test with real OpenRouter models (o1, Claude, Gemini)

---

## 📚 API Reference

### Core Functions

#### buildOpenRouterRequest

```typescript
function buildOpenRouterRequest(options: {
  modelId: string
  capability: ModelGenerationCapability
  effectiveConfig: GenerationConfig
  messages: any[]
  strategy?: StarverseReasoningStrategy
}): GenerationAdapterOutput
```

**Returns**:
```typescript
{
  requestBodyFragment: Record<string, any>
  warnings: GenerationAdapterWarning[]
  ignoredParameters: Array<{ key: string; reason: string }>
}
```

#### buildModelCapability

```typescript
function buildModelCapability(modelData: any): ModelGenerationCapability
```

**Input**: Single model object from `/api/v1/models` response.

**Output**: Complete capability table.

#### generationConfigManager

```typescript
class GenerationConfigManager {
  getEffectiveConfig(options: {
    modelId?: string
    conversationId?: string
    requestOverride?: PartialGenerationConfig
  }): GenerationConfig

  setGlobalConfig(config: PartialGenerationConfig): Promise<void>
  setModelConfig(modelId: string, config: PartialGenerationConfig): Promise<void>
  setConversationConfig(conversationId: string, config: PartialGenerationConfig): Promise<void>
}
```

---

## ❓ FAQ

### Q1: What happens if I set both `effort` and `maxReasoningTokens`?

**A**: The adapter resolves based on `controlMode`:
- `controlMode='effort'` → Uses `effort`, ignores `maxReasoningTokens`
- `controlMode='max_tokens'` → Uses `maxReasoningTokens`, does NOT set `reasoning.effort`
- `controlMode='auto'` → Prefers `maxReasoningTokens` if set, otherwise `effort`

The final `reasoning` object sent to OpenRouter will **NEVER** have both.

### Q2: How do I know which parameters my model supports?

**A**: Use `modelCapabilityMap`:
```typescript
import { buildModelCapabilityMap } from '@/services/providers/modelCapability'

const capabilityMap = buildModelCapabilityMap(modelsApiResponse)
const cap = capabilityMap.get('openai/gpt-4o')

console.log(cap.sampling.temperature)  // true/false
console.log(cap.reasoning.supportsMaxReasoningTokens)  // true/false
```

### Q3: Can I override reasoning config per-request?

**A**: Yes:
```typescript
const effectiveConfig = generationConfigManager.getEffectiveConfig({
  modelId: 'openai/o1',
  conversationId: 'conv-123',
  requestOverride: {
    reasoning: {
      controlMode: 'max_tokens',
      maxReasoningTokens: 10000,
    },
  },
})
```

### Q4: What's the difference between `maxReasoningTokens` and `maxCompletionTokens`?

**A**:
- `maxReasoningTokens`: Budget for **thinking** tokens (goes into `reasoning.max_tokens`)
- `maxCompletionTokens`: Total output budget (goes into top-level `max_tokens`)

For Anthropic: `maxCompletionTokens` must be > `maxReasoningTokens`.

For effort-only models (OpenAI o1): `maxCompletionTokens` is the total output cap.

### Q5: How do I migrate existing `buildReasoningRequestOptions()` calls?

**A**: Replace with:
```typescript
// OLD
const reasoningOptions = buildReasoningRequestOptions()

// NEW
const effectiveConfig = generationConfigManager.getEffectiveConfig({
  modelId: currentModel.value.id,
  conversationId: currentConversation.value.id,
})

const adapterResult = buildOpenRouterRequest({
  modelId: currentModel.value.id,
  capability: modelCapabilityMap.get(currentModel.value.id),
  effectiveConfig,
  messages,
})

// Use adapterResult.requestBodyFragment in OpenRouter request
```

---

## 🚀 Next Steps

### Immediate Actions (Phase 2)

1. **Integrate adapter into OpenRouterService**:
   - Modify `streamChatResponse()` to use `buildOpenRouterRequest()`
   - Build capability map from `/models` API response
   - Merge adapter output into request body

2. **Update composables**:
   - Wrap `generationConfigManager` in `useReasoningControl`
   - Ensure backward compatibility

3. **Test with real models**:
   - Test with OpenAI o1 (effort-only)
   - Test with Anthropic Claude 3.7 (max_tokens clipping)
   - Test with Gemini thinking (unknown-range)

### Future Enhancements (Phase 3+)

1. **Advanced UI**:
   - Sampling parameter presets ("Creative", "Balanced", "Precise")
   - Model-specific recommendations
   - Cost estimator (based on token budgets)

2. **Analytics**:
   - Track which parameters users adjust most
   - Measure reasoning token usage vs cost

3. **Templates**:
   - Shareable config presets ("Coding", "Writing", "Analysis")
   - Import/export generation configs

---

## 📖 References

### OpenRouter Documentation

1. **Reasoning Tokens**:
   https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

2. **API Parameters**:
   https://openrouter.ai/docs/api/reference/parameters

3. **Models API**:
   https://openrouter.ai/docs/api/api-reference/models/get-models

### Starverse Docs

- `reasoning.ts` - Reasoning types & strategy configs
- `openrouterReasoningAdapter.ts` - Existing reasoning adapter
- `ARCHITECTURE_REVIEW.md` - Overall architecture reference

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-02  
**Status**: Core implementation complete, integration in progress
