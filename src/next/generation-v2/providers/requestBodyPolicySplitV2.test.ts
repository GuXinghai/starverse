import { describe, expect, it } from 'vitest'
import { readApiRequestBodyContractV2 } from '../../../core/generation-v2/contracts/apiRequestBodyContractV2'
import { compileOpenAIResponsesRequestV1 } from '../../../core/generation-v2/providers/openai-responses/responsesRequestV1'
import { compileAnthropicMessagesRequestV1 } from '../../../core/generation-v2/providers/anthropic/messagesRequestV1'
import { decodeResolvedGenerationIntentV2 } from '../../../core/generation-v2/domain/resolvedGenerationIntentV2'
import { compileGeminiGenerateContentRequestV1 } from '../../../core/generation-v2/providers/gemini/generateContentRequestV1'
import { compileGeminiInteractionsRequestV1 } from '../../../core/generation-v2/providers/gemini/interactionsRequestV1'
import { compileDeepSeekStableChatRequestV1 } from '../../../core/generation-v2/providers/deepseek/chatRequestV1'
import { compileOpenRouterChatRequestV1 } from '../../../core/generation-v2/providers/openrouter/chatRequestV1'
import { compileOpenRouterImageRequestV1 } from '../../../core/generation-v2/providers/openrouter-images/imageRequestV1'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from '../../../core/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { compileGenericLocalOpenAIChatRequestV1 } from '../../../core/generation-v2/providers/generic-local-openai-chat/chatRequestV1'
import { compileOllamaNativeChatRequestV1 } from '../../../core/generation-v2/providers/ollama-chat/chatRequestV1'
import { compileLmStudioOpenResponsesRequestV1 } from '../../../core/generation-v2/providers/lmstudio-openresponses/responsesRequestV1'
import { buildCompatibleChatRequest } from '../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import type { CompatibleRequestProfileConfig } from '../../../shared/provider/openai-chat-compatible/schemas'

const userItem = Object.freeze({ role: 'user' as const, content: Object.freeze([{ type: 'input_text' as const, text: 'hello' }]) })
const chatMessage = Object.freeze({ role: 'user' as const, content: 'hello' })
const compatibleProfile: CompatibleRequestProfileConfig = {
  schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', defaults: {},
  extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
}

const anthropicIntent = (temperature: number, manualBudget = 1_024) => decodeResolvedGenerationIntentV2({
  schemaVersion: 2,
  generation: { maxOutputTokens: 2_048, temperature, topP: 0.8, topK: 20, stop: ['END'] },
  reasoning: { mode: 'enabled', effort: 'high' }, web: { mode: 'disabled' }, image: { mode: 'disabled' },
  tools: { mode: 'disabled' }, attachments: [],
  providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'manual', manualThinkingBudgetTokens: manualBudget },
}).value

const imageDescriptorSet = decodeCanonicalOpenRouterImageDescriptorSetV2({
  id: 'test/image-model', endpoints: [{ provider_name: 'Test provider', provider_tag: 'test-provider', provider_slug: 'test-provider',
    supported_parameters: { n: { type: 'range', min: 1, max: 1 } }, allowed_passthrough_parameters: [], supports_streaming: false }],
})

describe('new API body revisions leave numeric policy to request rules', () => {
  it('preserves legacy numeric restrictions while allowing finite wire values on all 11 new codec paths', () => {
    const responsesRevision = readApiRequestBodyContractV2('openai_responses', 'text').bodySchemaRevision
    expect(() => compileOpenAIResponsesRequestV1({ model: 'test-model', priorArtifact: null, clientItems: [userItem],
      generation: { temperature: 3 } })).toThrow()
    expect(compileOpenAIResponsesRequestV1({ model: 'test-model', priorArtifact: null, clientItems: [userItem],
      generation: { temperature: 3 } }, 'text', responsesRevision).nativeRequest.temperature).toBe(3)

    const anthropicRevision = readApiRequestBodyContractV2('anthropic', 'text').bodySchemaRevision
    const anthropicInput = { modelId: 'test-model', intent: anthropicIntent(0.4, 512), messages: [{ role: 'user', content: 'hello' }] }
    const legacyAnthropic = compileAnthropicMessagesRequestV1(anthropicInput)
    expect(legacyAnthropic.issues.length).toBeGreaterThan(0)
    const currentAnthropic = compileAnthropicMessagesRequestV1(anthropicInput, 'text', anthropicRevision)
    expect(currentAnthropic.issues).toEqual([])
    expect(currentAnthropic.nativeRequest?.thinking?.budget_tokens).toBe(512)

    const geminiContentRevision = readApiRequestBodyContractV2('google_ai_studio', 'text').bodySchemaRevision
    const geminiContentInput = { clientContents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      reasoning: { mode: 'disabled' }, generation: { temperature: 3 } }
    expect(() => compileGeminiGenerateContentRequestV1(geminiContentInput)).toThrow()
    expect(compileGeminiGenerateContentRequestV1(geminiContentInput, 'text', geminiContentRevision)
      .nativeRequest.generationConfig.temperature).toBe(3)

    const interactionsRevision = readApiRequestBodyContractV2('google_ai_studio', 'image_generate').bodySchemaRevision
    const interactionsInput = { model: 'test-image-model', prompt: 'draw a square', outputMode: 'image_only', image: {},
      generation: { temperature: 3 } }
    expect(() => compileGeminiInteractionsRequestV1(interactionsInput)).toThrow()
    expect(compileGeminiInteractionsRequestV1(interactionsInput, 'image_generate', interactionsRevision)
      .nativeRequest.generation_config?.temperature).toBe(3)

    const deepseekRevision = readApiRequestBodyContractV2('deepseek', 'text').bodySchemaRevision
    const deepseekInput = { model: 'test-model', priorArtifact: null, clientEntries: [{ kind: 'client', message: chatMessage }],
      thinking: { type: 'disabled' }, generation: { temperature: 3 } }
    expect(() => compileDeepSeekStableChatRequestV1(deepseekInput)).toThrow()
    expect(compileDeepSeekStableChatRequestV1(deepseekInput, 'text', deepseekRevision).nativeRequest.temperature).toBe(3)

    const openRouterRevision = readApiRequestBodyContractV2('openrouter', 'text').bodySchemaRevision
    const openRouterInput = { model: 'test-model', messages: [chatMessage], generation: { temperature: 3 } }
    expect(() => compileOpenRouterChatRequestV1(openRouterInput)).toThrow()
    expect(compileOpenRouterChatRequestV1(openRouterInput, 'text', openRouterRevision).nativeRequest.temperature).toBe(3)

    const imageRevision = readApiRequestBodyContractV2('openrouter', 'image_generate').bodySchemaRevision
    const imageInput = { prompt: 'draw a square', modelId: imageDescriptorSet.modelId.value, providerTag: 'test-provider',
      providerSlug: 'test-provider', descriptorSet: imageDescriptorSet, wireFields: [{ wireKey: 'n' as const, value: 2 }] }
    expect(() => compileOpenRouterImageRequestV1(imageInput)).toThrow()
    expect(JSON.parse(compileOpenRouterImageRequestV1(imageInput, 'image_generate', imageRevision).preparedBody.copyUtf8Text()).n).toBe(2)

    const localRevision = readApiRequestBodyContractV2('generic_local', 'text').bodySchemaRevision
    const localInput = { model: 'test-model', messages: [chatMessage], generation: { temperature: 3 } }
    expect(() => compileGenericLocalOpenAIChatRequestV1(localInput)).toThrow()
    expect(compileGenericLocalOpenAIChatRequestV1(localInput, 'text', localRevision).nativeRequest.temperature).toBe(3)

    const ollamaRevision = readApiRequestBodyContractV2('ollama', 'text').bodySchemaRevision
    const ollamaInput = { model: 'test-model', messages: [chatMessage], thinking: false, generation: { temperature: -1 } }
    expect(() => compileOllamaNativeChatRequestV1(ollamaInput)).toThrow()
    expect(compileOllamaNativeChatRequestV1(ollamaInput, 'text', ollamaRevision).nativeRequest.options?.temperature).toBe(-1)

    const lmStudioRevision = readApiRequestBodyContractV2('lmstudio', 'text').bodySchemaRevision
    const lmStudioInput = { model: 'test-model', replayItems: [userItem], generation: { temperature: 3 } }
    expect(() => compileLmStudioOpenResponsesRequestV1(lmStudioInput)).toThrow()
    expect(compileLmStudioOpenResponsesRequestV1(lmStudioInput, 'text', lmStudioRevision).nativeRequest.temperature).toBe(3)

    const compatibleRevision = readApiRequestBodyContractV2('openai_compatible', 'text').bodySchemaRevision
    const compatibleInput = { modelId: 'test-model', messages: [chatMessage], stream: true, profile: compatibleProfile,
      fields: { temperature: { state: 'explicit' as const, value: 3 } } }
    expect(() => buildCompatibleChatRequest(compatibleInput)).toThrow()
    expect(buildCompatibleChatRequest(compatibleInput, 'text', compatibleRevision).body.temperature).toBe(3)
  })
})
