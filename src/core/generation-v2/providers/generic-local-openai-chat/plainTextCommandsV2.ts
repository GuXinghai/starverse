import { createFixedLocalTextCommandDecodersV2, type FixedLocalTextEditResendCommandV2,
  type FixedLocalTextInitialCommandV2, type FixedLocalTextRegenerateCommandV2,
  type FixedLocalTextRetryCommandV2 } from '../../domain/fixedLocalTextCommandsV2'

const kinds = Object.freeze({ initial: 'generic_local_openai_chat_initial', retry: 'generic_local_openai_chat_retry',
  regenerate: 'generic_local_openai_chat_regenerate', editResend: 'generic_local_openai_chat_edit_resend',
  errorPrefix: 'GENERATION_V2_GENERIC_LOCAL' })
const codecs = createFixedLocalTextCommandDecodersV2(kinds)
export type GenericLocalOpenAIChatInitialCommandV2 = FixedLocalTextInitialCommandV2<typeof kinds.initial>
export type GenericLocalOpenAIChatRetryCommandV2 = FixedLocalTextRetryCommandV2<typeof kinds.retry>
export type GenericLocalOpenAIChatRegenerateCommandV2 = FixedLocalTextRegenerateCommandV2<typeof kinds.regenerate>
export type GenericLocalOpenAIChatEditResendCommandV2 = FixedLocalTextEditResendCommandV2<typeof kinds.editResend>
export const decodeGenericLocalOpenAIChatInitialCommandV2 = codecs.decodeInitial
export const decodeGenericLocalOpenAIChatRetryCommandV2 = codecs.decodeRetry
export const decodeGenericLocalOpenAIChatRegenerateCommandV2 = codecs.decodeRegenerate
export const decodeGenericLocalOpenAIChatEditResendCommandV2 = codecs.decodeEditResend
export const isGenericLocalOpenAIChatInitialCommandV2 = codecs.isInitial
export const isGenericLocalOpenAIChatRetryCommandV2 = codecs.isRetry
export const isGenericLocalOpenAIChatRegenerateCommandV2 = codecs.isRegenerate
export const isGenericLocalOpenAIChatEditResendCommandV2 = codecs.isEditResend
