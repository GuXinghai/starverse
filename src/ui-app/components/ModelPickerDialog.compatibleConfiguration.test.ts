import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import ModelPickerDialog from './ModelPickerDialog.vue'
import { compatibleConfigurationSelectionSchema } from '@/next/provider/openai-chat-compatible/ui'

describe('ModelPickerDialog compatible configuration-only source', () => {
  it('emits the complete instance-scoped immutable selection without treating it as RuntimeProviderKey', async () => {
    const selection = compatibleConfigurationSelectionSchema.parse({
      kind: 'openai_chat_compatible_configuration' as const,
      providerInstanceId: 'ocp_provider_12345678', providerName: 'First', modelId: 'same-model',
      endpointRevisionId: 'ocp_endpoint_12345678', credentialVersionRef: null,
      requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
    })
    const onSelect = vi.fn()
    const selectionCommand = vi.fn(async () => undefined)
    render(ModelPickerDialog, {
      props: {
        open: true, selectedModelId: '',
        compatibleConfigurationSources: [{ providerInstanceId: selection.providerInstanceId, providerName: 'First', models: [{ modelId: 'same-model', displayName: 'Same model', sourceLabel: 'manual', selection }] }],
        selectionCommand,
        onSelect,
      },
    })
    await fireEvent.click(screen.getByTestId('compatible-model-ocp_provider_12345678-same-model'))
    await waitFor(() => expect(selectionCommand).toHaveBeenCalledWith(selection))
    expect(onSelect).toHaveBeenCalledWith(selection, 'Same model')
  })
})
