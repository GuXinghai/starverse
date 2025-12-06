# Migration Guide: Unified Generation Architecture

**Target Audience**: Starverse developers updating code to use the new unified generation system  
**Date**: 2025-12-02

---

## 🎯 Migration Objectives

This guide helps you migrate from:

❌ **OLD**: Ad-hoc `reasoning` options + manual parameter assembly  
✅ **NEW**: Unified `GenerationConfig` + capability-aware adapter

**Key Changes**:
1. Replace `buildReasoningRequestOptions()` with `GenerationConfigManager`
2. Use `buildOpenRouterRequest()` adapter instead of manual object building
3. Check model capabilities before setting parameters

---

## 📦 New Imports

### Before

```typescript
import { useReasoningControl } from '@/composables/useReasoningControl'
```

### After

```typescript
// Core types
import type { GenerationConfig, ModelGenerationCapability } from '@/types/generation'

// Adapter
import { buildOpenRouterRequest } from '@/services/providers/generationAdapter'

// Capability builder
import { buildModelCapabilityMap } from '@/services/providers/modelCapability'

// Config manager
import { 
  generationConfigManager, 
  useGenerationConfig 
} from '@/services/providers/generationConfigManager'
```

---

## 🔄 Migration Patterns

### Pattern 1: Building Reasoning Request Options

#### ❌ OLD CODE

```typescript
// In ChatView.vue or useMessageSending.ts
import { useReasoningControl } from '@/composables/useReasoningControl'

const reasoningControl = useReasoningControl({
  reasoningPreference: currentReasoningPreference,
  isActive,
  activeProvider,
  currentModelId,
  modelDataMap,
  onUpdatePreference: updateReasoningPreference,
})

// Build options
const reasoningOptions = reasoningControl.buildReasoningRequestOptions()

// Send to OpenRouter
const result = await openRouterService.streamChatResponse(
  apiKey,
  history,
  modelId,
  userMessage,
  baseUrl,
  {
    reasoning: reasoningOptions,  // { payload, preference, modelId }
    parameters: samplingParameters,  // manually assembled
  }
)
```

#### ✅ NEW CODE

```typescript
// In ChatView.vue or useMessageSending.ts
import { useGenerationConfig } from '@/services/providers/generationConfigManager'
import { buildOpenRouterRequest } from '@/services/providers/generationAdapter'

// Get effective config (auto-merges 4 layers)
const { effectiveConfig } = useGenerationConfig({
  modelId: computed(() => currentModel.value.id),
  conversationId: computed(() => currentConversation.value.id),
})

// Get model capability
const capability = modelCapabilityMap.value.get(currentModel.value.id)

// Build request using adapter
const adapterResult = buildOpenRouterRequest({
  modelId: currentModel.value.id,
  capability,
  effectiveConfig: effectiveConfig.value,
  messages: history,
})

// Check warnings
if (adapterResult.warnings.length > 0) {
  console.warn('[Generation] Adapter warnings:', adapterResult.warnings)
}

// Send to OpenRouter (merge fragment into request body)
const result = await openRouterService.streamChatResponse(
  apiKey,
  history,
  modelId,
  userMessage,
  baseUrl,
  {
    // No need to pass reasoning/parameters separately
    // OpenRouterService will use adapterResult internally
  }
)
```

---

### Pattern 2: Updating Reasoning Preferences

#### ❌ OLD CODE

```typescript
// Update reasoning effort
const updateReasoningPreference = (updates: Partial<ReasoningPreference>) => {
  // Manually update store
  convoStore.updateConversationMetadata(currentConversation.value.id, {
    reasoningPreference: {
      ...currentReasoningPreference.value,
      ...updates,
    },
  })
}

// Update effort
updateReasoningPreference({ effort: 'high' })
```

#### ✅ NEW CODE

```typescript
// Use config manager
const { updateConversationConfig } = useGenerationConfig({
  conversationId: computed(() => currentConversation.value.id),
})

// Update reasoning effort (persists automatically)
await updateConversationConfig({
  reasoning: {
    effort: 'high',
  },
})

// Update sampling parameters
await updateConversationConfig({
  sampling: {
    temperature: 0.7,
    top_p: 0.9,
  },
})
```

---

### Pattern 3: OpenRouterService Integration

#### ❌ OLD CODE

```typescript
// In OpenRouterService.js - streamChatResponse()

// Extract options
let reasoning = null
let samplingParameters = null
if (options && typeof options === 'object') {
  if ('reasoning' in options) {
    reasoning = options.reasoning
  }
  if ('parameters' in options) {
    samplingParameters = options.parameters
  }
}

// Manually build request body
const requestBody = {
  model: modelName,
  messages: filteredMessages,
  stream: true,
}

// Add reasoning manually
if (reasoning && reasoning.payload) {
  requestBody.reasoning = { ...reasoning.payload }
}

// Add sampling manually
if (samplingParameters) {
  Object.assign(requestBody, samplingParameters)
}
```

#### ✅ NEW CODE

```typescript
// In OpenRouterService.js - streamChatResponse()

import { buildOpenRouterRequest } from './generationAdapter'
import { modelCapabilityMap } from './modelCapability'  // singleton

// Extract generation config (or use default)
let generationConfig = DEFAULT_GENERATION_CONFIG
if (options && options.generationConfig) {
  generationConfig = options.generationConfig
}

// Get model capability
const capability = modelCapabilityMap.get(modelName)
if (!capability) {
  console.warn(`[OpenRouter] No capability found for ${modelName}, using defaults`)
  // Proceed with empty capability (adapter will ignore all params)
}

// Build request using unified adapter
const adapterResult = buildOpenRouterRequest({
  modelId: modelName,
  capability: capability || createFallbackCapability(modelName),
  effectiveConfig: generationConfig,
  messages: filteredMessages,
})

// Log warnings
if (adapterResult.warnings.length > 0) {
  console.warn('[OpenRouter] Generation warnings:', adapterResult.warnings)
}
if (adapterResult.ignoredParameters.length > 0) {
  console.warn('[OpenRouter] Ignored parameters:', adapterResult.ignoredParameters)
}

// Build final request body
const requestBody = {
  model: modelName,
  messages: filteredMessages,
  stream: true,
  ...adapterResult.requestBodyFragment,  // ⭐ UNIFIED FRAGMENT
}
```

---

### Pattern 4: Model Capability Checking

#### ❌ OLD CODE

```typescript
// Manual check (fragile)
const supportsReasoning = (modelId: string) => {
  return modelId.toLowerCase().includes('o1') ||
         modelId.toLowerCase().includes('reasoning') ||
         modelId.toLowerCase().includes('thinking')
}

if (supportsReasoning(currentModel.value.id)) {
  // Show reasoning controls
}
```

#### ✅ NEW CODE

```typescript
import { supportsParameter } from '@/services/providers/modelCapability'

// Get capability
const capability = modelCapabilityMap.value.get(currentModel.value.id)

// Check specific parameter
if (supportsParameter(capability, 'reasoning')) {
  // Show reasoning controls
}

// Check sampling parameter
if (supportsParameter(capability, 'temperature')) {
  // Show temperature slider
}

// Check if model returns visible reasoning
if (capability?.reasoning.returnsVisibleReasoning === 'yes') {
  // Enable reasoning display toggle
}
```

---

## 🔧 Component Updates

### ChatView.vue

#### ❌ OLD

```vue
<script setup lang="ts">
import { useReasoningControl } from '@/composables/useReasoningControl'

const reasoningManager = useReasoningControl({
  reasoningPreference: currentReasoningPreference,
  isActive,
  activeProvider,
  currentModelId,
  modelDataMap,
  onUpdatePreference: updateReasoningPreference,
})

const {
  isReasoningEnabled,
  isReasoningControlAvailable,
  buildReasoningRequestOptions,
} = reasoningManager
</script>
```

#### ✅ NEW

```vue
<script setup lang="ts">
import { useGenerationConfig } from '@/services/providers/generationConfigManager'
import { computed } from 'vue'

const { 
  effectiveConfig, 
  updateConversationConfig 
} = useGenerationConfig({
  modelId: computed(() => currentModel.value?.id),
  conversationId: computed(() => currentConversation.value?.id),
})

// Check if reasoning is enabled
const isReasoningEnabled = computed(() => {
  return effectiveConfig.value.reasoning?.controlMode !== 'disabled'
})

// Check if model supports reasoning
const capability = computed(() => {
  return modelCapabilityMap.value.get(currentModel.value?.id)
})
const isReasoningControlAvailable = computed(() => {
  return capability.value?.reasoning.supportsReasoningParam === true
})

// Update reasoning config
const toggleReasoningEnabled = () => {
  const newMode = isReasoningEnabled.value ? 'disabled' : 'effort'
  updateConversationConfig({
    reasoning: { controlMode: newMode },
  })
}
</script>
```

### ChatToolbar.vue

#### ✅ NEW ADDITIONS

```vue
<script setup lang="ts">
import { useGenerationConfig } from '@/services/providers/generationConfigManager'

const { effectiveConfig, updateConversationConfig } = useGenerationConfig({
  modelId: computed(() => currentModel.value?.id),
  conversationId: computed(() => currentConversation.value?.id),
})

// Temperature slider
const temperature = computed({
  get: () => effectiveConfig.value.sampling?.temperature ?? 1.0,
  set: (value) => {
    updateConversationConfig({
      sampling: { temperature: value },
    })
  },
})

// Reasoning effort selector
const reasoningEffort = computed({
  get: () => effectiveConfig.value.reasoning?.effort ?? 'medium',
  set: (value) => {
    updateConversationConfig({
      reasoning: { effort: value },
    })
  },
})
</script>

<template>
  <div class="chat-toolbar">
    <!-- Temperature Slider -->
    <div v-if="capability?.sampling.temperature" class="parameter-control">
      <label>Temperature: {{ temperature.toFixed(2) }}</label>
      <input 
        type="range" 
        min="0" 
        max="2" 
        step="0.1" 
        v-model.number="temperature"
      />
    </div>

    <!-- Reasoning Effort Selector -->
    <div v-if="capability?.reasoning.supportsReasoningParam" class="parameter-control">
      <label>Reasoning Effort</label>
      <select v-model="reasoningEffort">
        <option value="minimal">Minimal</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </div>
  </div>
</template>
```

---

## 🧪 Testing Checklist

After migration, verify:

### ✅ Functional Tests

- [ ] **Reasoning models** (o1, Claude 3.7, Gemini thinking):
  - [ ] Effort mode works (low/medium/high)
  - [ ] Max tokens mode works (with clipping)
  - [ ] Visibility toggle works (exclude/include)

- [ ] **Non-reasoning models** (GPT-4o, Claude 3.5):
  - [ ] Reasoning controls hidden
  - [ ] Sampling parameters work (temperature, top_p)

- [ ] **Parameter filtering**:
  - [ ] Unsupported parameters ignored
  - [ ] Warnings logged to console
  - [ ] No errors in OpenRouter response

- [ ] **Configuration persistence**:
  - [ ] Global config saved to electron-store
  - [ ] Conversation config persists across restarts
  - [ ] Model-specific overrides work

### ✅ Regression Tests

- [ ] Existing conversations render correctly
- [ ] Old reasoning preferences migrated
- [ ] No breaking changes in ChatView/ChatInputArea

---

## 🐛 Common Issues & Solutions

### Issue 1: `modelCapabilityMap` is undefined

**Cause**: Capability map not initialized from `/models` API.

**Solution**:
```typescript
// In App.vue or main initialization
import { buildModelCapabilityMap } from '@/services/providers/modelCapability'

const initializeCapabilities = async () => {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await response.json()
  window.modelCapabilityMap = buildModelCapabilityMap(data)
}
```

### Issue 2: Warnings about unsupported parameters

**Expected**: The adapter logs warnings when:
- User sets `top_k` for a model that doesn't support it
- User sets `maxReasoningTokens` above model's limit

**Action**: These are informational, not errors. Update UI to show warnings to user.

### Issue 3: Reasoning not working for Claude 3.7

**Cause**: Capability detection failed.

**Debug**:
```typescript
const cap = modelCapabilityMap.get('anthropic/claude-3.7-sonnet')
console.log('Reasoning support:', cap?.reasoning.supportsReasoningParam)
console.log('Family:', cap?.reasoning.family)
console.log('Max tokens policy:', cap?.reasoning.maxTokensPolicy)
```

**Fix**: Ensure model ID matches exactly (case-sensitive).

### Issue 4: Type errors after migration

**Cause**: Old types still imported.

**Solution**:
```typescript
// Remove old imports
❌ import type { ReasoningPreference } from '@/types/store'

// Use new types
✅ import type { GenerationConfig } from '@/types/generation'
```

---

## 📚 Reference Materials

### Quick Reference

**Get effective config**:
```typescript
const config = generationConfigManager.getEffectiveConfig({
  modelId: 'openai/gpt-4o',
  conversationId: 'conv-123',
})
```

**Update conversation config**:
```typescript
await generationConfigManager.setConversationConfig('conv-123', {
  sampling: { temperature: 0.8 },
})
```

**Build request**:
```typescript
const result = buildOpenRouterRequest({
  modelId,
  capability,
  effectiveConfig,
  messages,
})
```

**Check capability**:
```typescript
if (supportsParameter(capability, 'reasoning')) {
  // ...
}
```

### Full Documentation

- `UNIFIED_GENERATION_ARCHITECTURE.md` - Complete architecture overview
- `types/generation.ts` - All type definitions
- `services/providers/generationAdapter.ts` - Adapter implementation

---

## 🚀 Next Steps

1. **Update OpenRouterService.js**:
   - Replace manual request building with adapter
   - Add capability map initialization

2. **Update composables**:
   - Migrate `useReasoningControl` to use config manager
   - Update `useMessageSending` to pass `effectiveConfig`

3. **Update UI components**:
   - Add sampling parameter controls to ChatToolbar
   - Show capability-based UI (hide unsupported controls)

4. **Test thoroughly**:
   - Test with all model families (OpenAI, Anthropic, Gemini, etc.)
   - Verify persistence across restarts
   - Check for regressions in existing features

5. **Clean up**:
   - Remove old `buildReasoningRequestOptions` code
   - Delete obsolete types
   - Update documentation

---

**Migration Status**: 🟡 In Progress  
**Estimated Completion**: Phase 2 (current phase)  
**Contact**: See UNIFIED_GENERATION_ARCHITECTURE.md for architecture questions
