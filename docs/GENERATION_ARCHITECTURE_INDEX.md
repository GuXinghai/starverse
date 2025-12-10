# Unified Generation Architecture - File Index

Quick reference for all files in the unified generation architecture.

---

## 📁 Core Implementation Files

### Type Definitions

**`src/types/generation.ts`** (510 lines)
- Unified `GenerationConfig` type (sampling + length + reasoning)
- `ModelGenerationCapability` with full supported_parameters
- `SamplingConfig`, `LengthConfig` types
- 4-layer override system types (`ConfigSource`, `GenerationConfigStack`)
- Default values matching OpenRouter specs
- All parameters documented with OpenRouter docs links

**Status**: ✅ Complete

---

### Services & Adapters

**`src/services/providers/modelCapability.ts`** (450 lines)
- `buildModelCapability(modelData)` - Parse single model from API
- `buildModelCapabilityMap(response)` - Batch builder for all models
- `detectModelFamily(modelId)` - Infer family (OpenAI/Anthropic/Gemini/xAI/Qwen)
- `detectReasoningSupport(modelId, supportedParams)` - Check reasoning capability
- `detectVisibleReasoning(modelId)` - Check if model returns reasoning tokens
- `supportsParameter(capability, paramName)` - Query helper
- Whitelist maintenance (reasoning models, visibility map)

**Status**: ✅ Complete

---

**`src/services/providers/generationAdapter.ts`** (500+ lines)
- `buildOpenRouterRequest(options)` - **Main entry point**
- Sub-adapter 1: `applySamplingConfig()` - Sampling parameter filtering & validation
- Sub-adapter 2: `buildReasoningPayload()` - Delegates to openrouterReasoningAdapter.ts
- Sub-adapter 3: `applyLengthConfig()` - Length control with reasoning awareness
- `resolveReasoningConfig()` - Converts 'auto' mode to effort/max_tokens
- `mergeGenerationConfig()` - Deep merge utility
- `validateGenerationConfig()` - Config validator

**Status**: ✅ Complete

---

**`src/services/providers/generationConfigManager.ts`** (400+ lines)
- `GenerationConfigManager` class - 4-layer config CRUD
- `getGlobalConfig()`, `setGlobalConfig()` - Global defaults
- `getModelConfig(modelId)`, `setModelConfig(modelId, config)` - Model-specific
- `getConversationConfig(conversationId)`, `setConversationConfig()` - Conversation-level
- `getEffectiveConfig(options)` - Merges all 4 layers
- `getConfigStack(options)` - Debug helper (shows all layers)
- electron-store persistence
- `useGenerationConfig()` composable - Vue integration

**Status**: ✅ Complete

---

**`src/services/providers/openrouterReasoningAdapter.ts`** (510 lines)
- **Existing file** - Kept and extended
- `buildReasoningPayload()` - Reasoning sub-adapter
- `handleAnthropicMaxTokens()` - Anthropic [1024, 32000] clipping
- `handleProviderUnknownRangeMaxTokens()` - Gemini/Qwen strategy
- `handleEffortOnlyMaxTokens()` - OpenAI o-series strategy
- `chooseCompletionMaxTokensForEffort()` - Effort mode completion calc
- `chooseCompletionMaxTokensForAnthropic()` - Anthropic completion calc

**Status**: ✅ Existing (integrated with new architecture)

---

## 📚 Documentation Files

**`docs/UNIFIED_GENERATION_ARCHITECTURE.md`** (800+ lines)
- Executive summary
- Architecture overview with ASCII diagram
- File structure
- Key types (GenerationConfig, ModelGenerationCapability)
- Adapter flow (3 sub-adapters)
- Safety rails (6 hard constraints)
- 4-layer config system
- Migration phases (1-4)
- API reference
- FAQ (5 questions)
- Testing strategy
- Next steps

**Status**: ✅ Complete

---

**`docs/GENERATION_MIGRATION_GUIDE.md`** (600+ lines)
- Migration objectives
- New imports
- 4 migration patterns (before/after code):
  1. Building reasoning request options
  2. Updating reasoning preferences
  3. OpenRouterService integration
  4. Model capability checking
- Component updates (ChatView.vue, ChatToolbar.vue)
- Testing checklist (functional + regression)
- Common issues & solutions
- Quick reference
- Next steps

**Status**: ✅ Complete

---

**`docs/GENERATION_ARCHITECTURE_SUMMARY.md`** (current file)
- Implementation summary
- Deliverables checklist
- Code statistics
- Current status (phases 1-4)
- Key design decisions
- Testing strategy
- Compliance summary
- Next steps for developers

**Status**: ✅ Complete

---

**`docs/GENERATION_ARCHITECTURE_INDEX.md`** (this file)
- Quick reference for all files
- File purposes and line counts
- Status tracking
- Related files

**Status**: ✅ Complete

---

## 🔗 Related Existing Files

### Types (Referenced)

**`src/types/reasoning.ts`** (380 lines)
- `ReasoningEffort`, `ReasoningControlMode` - Existing enums
- `ModelReasoningCapability` - Reasoning-specific capability
- `ReasoningUserConfig`, `ReasoningResolvedConfig` - User-facing config
- `ReasoningPayload` - OpenRouter request shape
- `StarverseReasoningStrategy` - Starverse-specific strategies
- Default values and presets

**Status**: ✅ Existing (used by new architecture)

---

### Services (To Be Updated)

**`src/services/providers/OpenRouterService.js`** (1839 lines)
- Main provider implementation
- `streamChatResponse()` - **Needs integration with adapter**
- Currently: Manual parameter assembly
- Future: Use `buildOpenRouterRequest()`

**Status**: 🔧 Needs update (Phase 2)

---

### Composables (To Be Updated)

**`src/composables/useReasoningControl.ts`** (538 lines)
- Reasoning mode configuration composable
- `buildReasoningRequestOptions()` - **Needs migration**
- Currently: Returns `{ payload, preference, modelId }`
- Future: Wrap `generationConfigManager`

**Status**: 🔧 Needs update (Phase 2)

---

**`src/composables/chat/useMessageSending.ts`**
- Message sending logic
- Uses `buildReasoningRequestOptions()`
- **Needs migration** to `effectiveConfig`

**Status**: 🔧 Needs update (Phase 2)

---

**`src/composables/chat/useMessageRetry.ts`**
- Message retry logic
- Uses `buildReasoningRequestOptions()`
- **Needs migration** to `effectiveConfig`

**Status**: 🔧 Needs update (Phase 2)

---

### Components (To Be Updated)

**`src/components/ChatView.vue`** (2000+ lines)
- Main chat interface
- Uses `useReasoningControl`
- **Needs migration** to `useGenerationConfig`

**Status**: 🔧 Needs update (Phase 2)

---

**`src/components/chat/ChatToolbar.vue`**
- Toolbar with model selector
- **Needs sampling controls** (temperature, top_p, etc.)
- **Needs capability-based UI** (hide unsupported controls)

**Status**: 🔧 Needs update (Phase 3)

---

**`src/components/chat/ChatInputArea.vue`**
- Input area with attachment support
- May need integration with config manager

**Status**: 🔧 Needs review (Phase 3)

---

## 📊 Summary Statistics

| Category | Files | Total Lines | Status |
|----------|-------|-------------|--------|
| **Core Implementation** | 4 new + 1 extended | ~2000 | ✅ Complete |
| **Documentation** | 4 | ~2500 | ✅ Complete |
| **To Update** | 6 | ~5000 | 🔧 Pending |
| **Total** | 15 | ~9500 | 60% complete |

---

## 🗺️ Navigation Guide

### Start Here

1. **Overview**: `UNIFIED_GENERATION_ARCHITECTURE.md` (read first)
2. **Implementation Summary**: `GENERATION_ARCHITECTURE_SUMMARY.md` (this doc's sibling)
3. **Migration Guide**: `GENERATION_MIGRATION_GUIDE.md` (for developers)

### Dive into Code

1. **Types**: `src/types/generation.ts` (understand data structures)
2. **Capability**: `src/services/providers/modelCapability.ts` (model support)
3. **Adapter**: `src/services/providers/generationAdapter.ts` (request building)
4. **Config Manager**: `src/services/providers/generationConfigManager.ts` (4-layer system)

### Integration Phase

1. **OpenRouterService**: Update `streamChatResponse()` to use adapter
2. **Composables**: Migrate `useReasoningControl`, `useMessageSending`, `useMessageRetry`
3. **Components**: Update `ChatView`, `ChatToolbar`, `ModernChatInput`  
   *注：`ChatInputArea` 已归档*

---

## 🎯 Quick Links

### Core Implementation
- [generation.ts](../src/types/generation.ts)
- [modelCapability.ts](../src/services/providers/modelCapability.ts)
- [generationAdapter.ts](../src/services/providers/generationAdapter.ts)
- [generationConfigManager.ts](../src/services/providers/generationConfigManager.ts)

### Documentation
- [Architecture Overview](UNIFIED_GENERATION_ARCHITECTURE.md)
- [Migration Guide](GENERATION_MIGRATION_GUIDE.md)
- [Implementation Summary](GENERATION_ARCHITECTURE_SUMMARY.md)
- [This Index](GENERATION_ARCHITECTURE_INDEX.md)

### Existing Files (Reference)
- [reasoning.ts](../src/types/reasoning.ts)
- [openrouterReasoningAdapter.ts](../src/services/providers/openrouterReasoningAdapter.ts)
- [OpenRouterService.js](../src/services/providers/OpenRouterService.js)

---

**Last Updated**: 2025-12-02  
**Phase**: 1 Complete, 2 Ready to Start  
**Maintainer**: Starverse Generation & Reasoning Architect
