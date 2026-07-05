import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listMessageImageAssetsByMessageIds,
  listReasoningDisplayBlocksByMessageIds,
  persistDetachedImageAssetsFromDataUrls,
  persistMessageImageAssetsFromDataUrls,
} from '@/next/message/messageClient'

describe('messageClient image assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists generated image data URLs through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      assets: [
        {
          messageId: 'assistant_1',
          assetId: 'asset_1',
          ordinal: 0,
          mime: 'image/png',
          width: 16,
          height: 16,
          assetUrl: 'asset://asset_1',
        },
      ],
    }))
    vi.stubGlobal('dbBridge', { invoke })

    await expect(persistMessageImageAssetsFromDataUrls({
      messageId: 'assistant_1',
      imageDataUrls: ['data:image/png;base64,iVBORw0KGgo='],
    })).resolves.toEqual([
      {
        messageId: 'assistant_1',
        assetId: 'asset_1',
        ordinal: 0,
        mime: 'image/png',
        width: 16,
        height: 16,
        assetUrl: 'asset://asset_1',
      },
    ])
    expect(invoke).toHaveBeenCalledWith('messageAsset.persistFromDataUrls', {
      messageId: 'assistant_1',
      imageDataUrls: ['data:image/png;base64,iVBORw0KGgo='],
    })
  })

  it('lists persisted message image assets through dbBridge', async () => {
    const invoke = vi.fn(async () => [
      {
        messageId: 'assistant_1',
        assetId: 'asset_1',
        ordinal: 0,
        mime: 'image/png',
        width: null,
        height: null,
        assetUrl: 'asset://asset_1',
      },
    ])
    vi.stubGlobal('dbBridge', { invoke })

    await expect(listMessageImageAssetsByMessageIds(['assistant_1', 'assistant_1', ''])).resolves.toEqual([
      {
        messageId: 'assistant_1',
        assetId: 'asset_1',
        ordinal: 0,
        mime: 'image/png',
        width: null,
        height: null,
        assetUrl: 'asset://asset_1',
      },
    ])
    expect(invoke).toHaveBeenCalledWith('messageAsset.listByMessageIds', {
      messageIds: ['assistant_1'],
    })
  })

  it('persists detached reasoning image data URLs without linking them to message content', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      assets: [
        {
          messageId: 'assistant_1',
          assetId: 'asset_1',
          ordinal: 0,
          mime: 'image/png',
          width: 16,
          height: 16,
          assetUrl: 'asset://asset_1',
        },
      ],
    }))
    vi.stubGlobal('dbBridge', { invoke })

    await expect(persistDetachedImageAssetsFromDataUrls({
      messageId: 'assistant_1',
      imageDataUrls: ['data:image/png;base64,iVBORw0KGgo='],
    })).resolves.toEqual([
      {
        messageId: 'assistant_1',
        assetId: 'asset_1',
        ordinal: 0,
        mime: 'image/png',
        width: 16,
        height: 16,
        assetUrl: 'asset://asset_1',
      },
    ])
    expect(invoke).toHaveBeenCalledWith('messageAsset.persistFromDataUrls', {
      messageId: 'assistant_1',
      imageDataUrls: ['data:image/png;base64,iVBORw0KGgo='],
      linkToMessage: false,
    })
  })

  it('hydrates reasoning display image blocks from structured asset references', async () => {
    const invoke = vi.fn(async () => [
      {
        messageId: 'assistant_1',
        blockId: 'reasoning_image_1',
        ordinal: 2,
        type: 'image',
        assetId: 'asset_1',
        fileAssetId: null,
        url: null,
        mimeType: 'image/png',
        width: 16,
        height: 16,
        alt: 'thought image',
        semanticRole: 'thought',
        providerKey: 'google-ai-studio',
        sourceEventType: 'message.reasoning_display_block',
        sourceRawSegmentId: 7,
        finalAt: 100,
      },
    ])
    vi.stubGlobal('dbBridge', { invoke })

    await expect(listReasoningDisplayBlocksByMessageIds(['assistant_1'])).resolves.toEqual([
      {
        messageId: 'assistant_1',
        blockId: 'reasoning_image_1',
        ordinal: 2,
        type: 'image',
        url: 'asset://asset_1',
        assetId: 'asset_1',
        mimeType: 'image/png',
        width: 16,
        height: 16,
        alt: 'thought image',
        semanticRole: 'thought',
        providerKey: 'google-ai-studio',
        sourceEventType: 'message.reasoning_display_block',
        sourceRawSegmentId: 7,
      },
    ])
    expect(invoke).toHaveBeenCalledWith('message.listReasoningDisplayBlocksByMessageIds', {
      messageIds: ['assistant_1'],
    })
  })
})
