export type ReasoningEffort = string

export type RequestedReasoningMode = 'auto' | 'effort'

export type ContentBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; url: string }>
  | Readonly<{ type: 'unknown'; raw: unknown }>

export type MessageAnnotation = Readonly<Record<string, unknown>>

export type ReasoningDisplayBlock =
  | Readonly<{
      blockId: string
      ordinal: number
      type: 'text'
      text: string
      semanticRole?: 'summary' | 'reasoning' | 'thinking' | 'thought'
      providerKey: string
      sourceEventType?: string
      sourceRawSegmentId?: number
    }>
  | Readonly<{
      blockId: string
      ordinal: number
      type: 'image'
      url: string
      assetId?: string
      fileAssetId?: string
      mimeType?: string
      width?: number
      height?: number
      alt?: string
      semanticRole?: 'summary' | 'reasoning' | 'thinking' | 'thought'
      providerKey: string
      sourceEventType?: string
      sourceRawSegmentId?: number
    }>
  | Readonly<{
      blockId: string
      ordinal: number
      type: 'opaque'
      opaqueKind?: 'encrypted' | 'omitted' | 'redacted'
      label: string
      warning?: string
      providerKey: string
      sourceEventType?: string
      sourceRawSegmentId?: number
    }>

export type ToolCallDelta = Readonly<{
  index?: number
  id?: string
  type?: string
  function?: Readonly<{
    name?: string
    arguments?: string
  }>
}>
