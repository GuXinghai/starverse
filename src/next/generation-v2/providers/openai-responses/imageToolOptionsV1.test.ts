import { describe, expect, it } from 'vitest'
import { compileOpenAIResponsesRequestV1 } from '../../../../core/generation-v2/providers/openai-responses/responsesRequestV1'
import { getOpenAIImageToolOptionsV1, isOpenAIImageToolSizeV1, OPENAI_IMAGE_TOOL_MODELS_V1 } from '../../../../core/generation-v2/providers/openai-responses/imageToolOptionsV1'
import { decodeGenerationIntentLayerV2 } from '../../../../core/generation-v2/domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../../../core/generation-v2/domain/generationIntentProjectionV2'
import { resolveEncodingCoverageRegistryV2, isOpenAILegacyImageEncoderRevisionV2 } from '../../../../core/generation-v2/capability/encodingCoverageRegistryV2'
import { readLegacyOpenAIResponsesBodyRequestContractV2, readApiRequestBodyContractV2 } from '../../../../core/generation-v2/contracts/apiRequestBodyContractV2'

const request = (tool: Record<string, unknown>, extra = {}) => compileOpenAIResponsesRequestV1({
  model: 'chat-model', priorArtifact: null, clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'draw' }] }],
  tools: [{ type: 'image_generation', ...tool }], ...extra,
})

describe('OpenAI hosted image configuration contract', () => {
  it('keeps the chat model, encodes every explicit image field and forces only the image tool', () => {
    const compiled = request({ model: 'gpt-image-2.5-flare', action: 'generate', size: '1536x864', quality: 'max',
      outputFormat: 'webp', outputCompression: 0, background: 'opaque', partialImages: 0, moderation: 'low' },
    { toolChoice: { type: 'image_generation' } })
    expect(JSON.parse(compiled.preparedBody.copyUtf8Text())).toMatchObject({ model: 'chat-model',
      tool_choice: { type: 'image_generation' }, tools: [{ type: 'image_generation', model: 'gpt-image-2.5-flare',
        action: 'generate', size: '1536x864', quality: 'max', output_format: 'webp', output_compression: 0,
        background: 'opaque', partial_images: 0, moderation: 'low' }] })
  })
  it('distinguishes default omission from explicit auto', () => {
    expect(request({}).nativeRequest.tools).toEqual([{ type: 'image_generation' }])
    expect(request({ action: 'auto', size: 'auto', quality: 'auto', background: 'auto', moderation: 'auto' },
      { toolChoice: 'auto' }).nativeRequest).toMatchObject({ tool_choice: 'auto', tools: [{ type: 'image_generation',
      action: 'auto', size: 'auto', quality: 'auto', background: 'auto', moderation: 'auto' }] })
  })
  it.each(OPENAI_IMAGE_TOOL_MODELS_V1)('encodes model $value with its declared quality domain', ({ value }) => {
    for (const quality of getOpenAIImageToolOptionsV1(value).qualities) {
      expect(request({ model: value, quality }).nativeRequest.tools?.[0]).toMatchObject({ model: value, quality })
    }
  })
  it.each([
    { model: 'unknown-image-model' }, { model: 'gpt-image-1-mini', quality: 'max' },
    { model: 'gpt-image-2', inputFidelity: 'high' }, { model: 'gpt-image-1-mini', inputFidelity: 'high' },
    { outputFormat: 'jpeg', background: 'transparent' }, { outputFormat: 'png', outputCompression: 30 },
    { outputFormat: 'jpeg', outputCompression: 101 }, { model: 'gpt-image-1', size: '1536x864' },
    { model: 'gpt-image-2', size: '1537x864' }, { moderation: 'unrestricted' },
  ])('rejects unsupported or contradictory configuration %j', (tool) => {
    expect(() => request(tool)).toThrow()
  })
  it('encodes PNG masks and legacy-model fidelity without making them normal image inputs', () => {
    expect(request({ model: 'gpt-image-1', action: 'edit', inputFidelity: 'high',
      inputImageMask: { imageUrl: 'data:image/png;base64,aGVsbG8=' } }).nativeRequest.tools?.[0])
      .toMatchObject({ input_fidelity: 'high', input_image_mask: { image_url: 'data:image/png;base64,aGVsbG8=' } })
  })
  it('validates the full custom size boundary', () => {
    expect(isOpenAIImageToolSizeV1('1536x864', 'gpt-image-2')).toBe(true)
    for (const size of ['256x256', '3840x3840', '3856x1024', '3072x512', '1000x1000']) {
      expect(isOpenAIImageToolSizeV1(size, 'gpt-image-2')).toBe(false)
    }
  })
  it('round trips canonical auto and branded mask references without putting paths or bytes in intent', () => {
    const image = { mode: 'generate', toolModel: 'gpt-image-1', action: 'edit', toolChoice: 'required', size: 'auto',
      inputFidelity: 'high', moderation: 'auto', partialImages: 0, outputCompression: 0,
      maskAsset: { assetId: 'asset:mask', assetRevisionId: 'revision:mask', assetSha256: 'a'.repeat(64) } }
    const decoded = decodeGenerationIntentLayerV2({ schemaVersion: 2, image })
    expect(projectGenerationIntentLayerV2(decoded)).toEqual({ schemaVersion: 2, image })
    expect(decoded.image?.mode === 'generate' && decoded.image.maskAsset?.assetId.value).toBe('asset:mask')
  })
  it('covers every new canonical field and changes the frozen body identity', () => {
    const coverage = resolveEncodingCoverageRegistryV2({ providerId: 'openai_responses', protocolContractId: 'openai-responses-v1', operation: 'text' })
    expect(coverage.semanticPaths).toEqual(expect.arrayContaining(['image.toolModel', 'image.action', 'image.toolChoice',
      'image.partialImages', 'image.outputCompression', 'image.inputFidelity', 'image.moderation', 'image.maskAsset']))
    expect(isOpenAILegacyImageEncoderRevisionV2(coverage.encoderRevision)).toBe(false)
    const legacy = readLegacyOpenAIResponsesBodyRequestContractV2('text')
    expect(legacy.bodySchemaRevision).not.toBe(readApiRequestBodyContractV2('openai_responses', 'text').bodySchemaRevision)
    expect(() => legacy.validateBody(request({ model: 'gpt-image-1' }).nativeRequest)).toThrow()
  })
})
