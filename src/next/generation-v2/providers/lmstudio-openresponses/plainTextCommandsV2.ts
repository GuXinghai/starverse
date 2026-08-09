import {
  createFixedLocalTextCommandDecodersV2,
  type FixedLocalTextEditResendCommandV2,
  type FixedLocalTextInitialCommandV2,
  type FixedLocalTextRegenerateCommandV2,
  type FixedLocalTextRetryCommandV2,
} from '../../domain/fixedLocalTextCommandsV2'

export type LmStudioPlainTextInitialCommandV2 =
  FixedLocalTextInitialCommandV2<'lmstudio_plain_text_initial'>
export type LmStudioPlainTextRetryCommandV2 =
  FixedLocalTextRetryCommandV2<'lmstudio_plain_text_retry'>
export type LmStudioPlainTextRegenerateCommandV2 =
  FixedLocalTextRegenerateCommandV2<'lmstudio_plain_text_regenerate'>
export type LmStudioPlainTextEditResendCommandV2 =
  FixedLocalTextEditResendCommandV2<'lmstudio_plain_text_edit_resend'>

const decoders = createFixedLocalTextCommandDecodersV2({
  initial: 'lmstudio_plain_text_initial',
  retry: 'lmstudio_plain_text_retry',
  regenerate: 'lmstudio_plain_text_regenerate',
  editResend: 'lmstudio_plain_text_edit_resend',
  errorPrefix: 'GENERATION_V2_LMSTUDIO',
})

export const decodeLmStudioPlainTextInitialCommandV2 = decoders.decodeInitial
export const decodeLmStudioPlainTextRetryCommandV2 = decoders.decodeRetry
export const decodeLmStudioPlainTextRegenerateCommandV2 = decoders.decodeRegenerate
export const decodeLmStudioPlainTextEditResendCommandV2 = decoders.decodeEditResend

export const isLmStudioPlainTextInitialCommandV2 = decoders.isInitial
export const isLmStudioPlainTextRetryCommandV2 = decoders.isRetry
export const isLmStudioPlainTextRegenerateCommandV2 = decoders.isRegenerate
export const isLmStudioPlainTextEditResendCommandV2 = decoders.isEditResend
