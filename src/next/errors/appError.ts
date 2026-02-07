export type AppErrorPhase =
  | 'pre_stream_request_error'
  | 'mid_stream_error'
  | 'local_transport_error'
  | 'local_protocol_error'
  | 'user_cancelled'
  | 'internal_bug'

export type AppErrorCategory =
  | 'invalid_request'
  | 'auth'
  | 'payment_credit'
  | 'moderation_blocked'
  | 'timeout'
  | 'rate_limited'
  | 'provider_bad_gateway'
  | 'no_provider_available'
  | 'provider_error_unknown'
  | 'network_unreachable'
  | 'protocol_invalid'
  | 'cancelled'
  | 'internal'

export type AppErrorGrade = 1 | 2 | 3

export type AppErrorUserActionHint =
  | 'check_api_key'
  | 'top_up'
  | 'edit_prompt'
  | 'retry_later'
  | 'switch_model'
  | 'shorten_context'
  | 'report_bug'
  | 'none'

export type AppError = Readonly<{
  phase: AppErrorPhase
  category: AppErrorCategory
  grade: AppErrorGrade
  retryable: boolean
  userActionHint: AppErrorUserActionHint
  code: string
  message: string
  httpStatus?: number
  providerName?: string
  metadata?: Record<string, unknown>
  finishReason?: string
  debug?: Record<string, unknown>
}>

