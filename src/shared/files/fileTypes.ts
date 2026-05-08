export type AssetKind =
  | 'image'
  | 'document'
  | 'text'
  | 'audio'
  | 'video'
  | 'archive'
  | 'binary'

export type DerivedKind =
  | 'thumbnail'
  | 'extracted_text'
  | 'ocr_text'
  | 'transcript'
  | 'converted_pdf'
  | 'converted_markdown'
  | 'rendered_images'
  | 'selected_frames'
  | 'extracted_audio'
  | 'send_optimized'
  | 'preview_optimized'
  | 'embedding_vector'

export type TaskFamily =
  | 'chat_context'
  | 'transcription'
  | 'embeddings'

export type ModelCapability =
  | 'text_in'
  | 'image_in'
  | 'file_in'
  | 'audio_in'
  | 'video_in'
  | 'text_out'
  | 'audio_out'
  | 'embeddings'

export type AiPayloadKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'audio'
  | 'video'
  | 'binary'

export type ProcessingStatus =
  | 'native_supported'
  | 'convertible'
  | 'local_only'
  | 'unsupported'

export type SourceKind =
  | 'local_upload'
  | 'url_import'
  | 'generated'
  | 'derived'

export type SendMode =
  | 'url_ref'
  | 'inline_base64'
  | 'provider_file_ref'

export type DraftAttachmentSendModePreference =
  | 'default'
  | 'auto'
  | 'url_ref'
  | 'inline_base64'

export type DraftAttachmentUrlRetentionPreference =
  | 'default'
  | 'link_only'
  | 'link_and_file'
