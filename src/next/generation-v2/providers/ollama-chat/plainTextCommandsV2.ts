import { createFixedLocalTextCommandDecodersV2, type FixedLocalTextEditResendCommandV2, type FixedLocalTextInitialCommandV2,
  type FixedLocalTextRegenerateCommandV2, type FixedLocalTextRetryCommandV2 } from '../../domain/fixedLocalTextCommandsV2'
const kinds = Object.freeze({ initial: 'ollama_chat_initial', retry: 'ollama_chat_retry', regenerate: 'ollama_chat_regenerate',
  editResend: 'ollama_chat_edit_resend', errorPrefix: 'GENERATION_V2_OLLAMA' })
const codecs = createFixedLocalTextCommandDecodersV2(kinds)
export type OllamaChatInitialCommandV2 = FixedLocalTextInitialCommandV2<typeof kinds.initial>
export type OllamaChatRetryCommandV2 = FixedLocalTextRetryCommandV2<typeof kinds.retry>
export type OllamaChatRegenerateCommandV2 = FixedLocalTextRegenerateCommandV2<typeof kinds.regenerate>
export type OllamaChatEditResendCommandV2 = FixedLocalTextEditResendCommandV2<typeof kinds.editResend>
export const decodeOllamaChatInitialCommandV2=codecs.decodeInitial, decodeOllamaChatRetryCommandV2=codecs.decodeRetry,
  decodeOllamaChatRegenerateCommandV2=codecs.decodeRegenerate, decodeOllamaChatEditResendCommandV2=codecs.decodeEditResend
export const isOllamaChatInitialCommandV2=codecs.isInitial, isOllamaChatRetryCommandV2=codecs.isRetry,
  isOllamaChatRegenerateCommandV2=codecs.isRegenerate, isOllamaChatEditResendCommandV2=codecs.isEditResend
