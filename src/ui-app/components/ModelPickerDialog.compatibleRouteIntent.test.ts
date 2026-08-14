import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModelPickerDialog from './ModelPickerDialog.vue'
import { createCompatibleRouteIntent } from '@/next/provider/openai-chat-compatible/ui'
import { installGenerationV2TestBridge } from '../../../tests/helpers/generationV2Bridge'

describe('ModelPickerDialog compatible current intent source', () => {
  beforeEach(() => {
    installGenerationV2TestBridge()
  })

  it('emits only provider-instance and model current intent', async () => {
    const routeIntent = createCompatibleRouteIntent({
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'same-model',
    })
    const onSelect = vi.fn()
    const selectionCommand = vi.fn(async () => undefined)
    render(ModelPickerDialog, {
      props: {
        open: true, routeSelection: null,
        compatibleRouteSources: [{
          providerInstanceId: routeIntent.providerInstanceId,
          providerName: 'First',
          models: [{ modelId: 'same-model', displayName: 'Same model', sourceLabel: 'manual', routeIntent }],
        }],
        selectionCommand,
        onSelect,
      },
    })
    await fireEvent.click(screen.getByTestId('compatible-model-ocp_provider_12345678-same-model'))
    await waitFor(() => expect(selectionCommand).toHaveBeenCalledWith(routeIntent))
    expect(onSelect).toHaveBeenCalledWith(routeIntent, 'Same model')
  })
})
