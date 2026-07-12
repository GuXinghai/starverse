export type CompatibleNetworkErrorCode =
  | 'compatible_config_invalid'
  | 'compatible_url_invalid'
  | 'compatible_address_blocked'
  | 'compatible_dns_rebinding_blocked'
  | 'compatible_strict_ssrf_unavailable'
  | 'compatible_redirect_blocked'
  | 'compatible_proxy_route_invalid'
  | 'compatible_transport_unavailable'
  | 'compatible_request_capacity'
  | 'compatible_credential_missing'
  | 'compatible_auth_invalid'
  | 'compatible_header_forbidden'
  | 'compatible_query_invalid'
  | 'compatible_extra_body_conflict'
  | 'compatible_request_mapping_invalid'
  | 'compatible_timeout'
  | 'compatible_aborted'
  | 'compatible_window_destroyed'
  | 'compatible_response_overflow'
  | 'compatible_sse_overflow'
  | 'compatible_json_malformed'
  | 'compatible_sse_malformed'
  | 'compatible_response_unsupported'
  | 'compatible_tool_delta_invalid'
  | 'compatible_reasoning_mapping_invalid'
  | 'compatible_inline_conflict'
  | 'compatible_extension_overflow'
  | 'compatible_network_proxy_tls'
  | 'compatible_http_auth'
  | 'compatible_http_rate_limit'
  | 'compatible_http_provider'
  | 'compatible_network_unknown'
  | 'compatible_catalog_sync_failed'

export type CompatibleNetworkStage =
  | 'url'
  | 'dns'
  | 'connect'
  | 'redirect'
  | 'headers'
  | 'request'
  | 'response'
  | 'stream'
  | 'lifecycle'

export type CompatibleNetworkErrorEnvelope = Readonly<{
  code: CompatibleNetworkErrorCode
  stage: CompatibleNetworkStage
  safeMessage: string
  retryable: boolean
  httpStatus?: number
}>

const SAFE_MESSAGES: Readonly<Record<CompatibleNetworkErrorCode, string>> = Object.freeze({
  compatible_config_invalid: 'The provider configuration is invalid.',
  compatible_url_invalid: 'The provider URL is invalid.',
  compatible_address_blocked: 'The provider address is blocked by network policy.',
  compatible_dns_rebinding_blocked: 'The provider address changed before connection.',
  compatible_strict_ssrf_unavailable: 'Strict SSRF protection is unavailable for the selected transport.',
  compatible_redirect_blocked: 'The provider redirect was blocked.',
  compatible_proxy_route_invalid: 'The selected proxy route is invalid.',
  compatible_transport_unavailable: 'The selected provider transport is unavailable.',
  compatible_request_capacity: 'Too many provider requests are active.',
  compatible_credential_missing: 'Provider credentials are unavailable.',
  compatible_auth_invalid: 'Provider authentication configuration is invalid.',
  compatible_header_forbidden: 'A provider request header is forbidden.',
  compatible_query_invalid: 'A provider query parameter is invalid.',
  compatible_extra_body_conflict: 'The provider request body contains a conflicting field.',
  compatible_request_mapping_invalid: 'The provider request mapping is invalid.',
  compatible_timeout: 'The provider request timed out.',
  compatible_aborted: 'The provider request was cancelled.',
  compatible_window_destroyed: 'The provider request ended because its window closed.',
  compatible_response_overflow: 'The provider response exceeded the allowed size.',
  compatible_sse_overflow: 'The provider event stream exceeded the allowed buffer size.',
  compatible_json_malformed: 'The provider returned malformed JSON.',
  compatible_sse_malformed: 'The provider returned a malformed event stream.',
  compatible_response_unsupported: 'The provider returned an unsupported response shape.',
  compatible_tool_delta_invalid: 'The provider returned an invalid tool-call fragment.',
  compatible_reasoning_mapping_invalid: 'The provider reasoning mapping is invalid.',
  compatible_inline_conflict: 'The provider response contains conflicting inline reasoning markers.',
  compatible_extension_overflow: 'The provider response extensions exceeded the allowed size.',
  compatible_network_proxy_tls: 'The provider network, proxy, or TLS connection failed.',
  compatible_http_auth: 'Provider authentication failed.',
  compatible_http_rate_limit: 'The provider rate limit was reached.',
  compatible_http_provider: 'The provider rejected the request.',
  compatible_network_unknown: 'The provider network request failed.',
  compatible_catalog_sync_failed: 'The provider model catalog could not be synchronized.',
})

export function buildCompatibleNetworkError(input: Readonly<{
  code: CompatibleNetworkErrorCode
  stage: CompatibleNetworkStage
  httpStatus?: number
}>): CompatibleNetworkErrorEnvelope {
  return Object.freeze({
    code: input.code,
    stage: input.stage,
    safeMessage: SAFE_MESSAGES[input.code],
    retryable: isCompatibleNetworkErrorRetryable(input.code),
    ...(typeof input.httpStatus === 'number' && Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599
      ? { httpStatus: input.httpStatus }
      : {}),
  })
}

export function compatibleNetworkErrorFromHttpStatus(status: number): CompatibleNetworkErrorEnvelope {
  if (status === 401 || status === 403 || status === 407) {
    return buildCompatibleNetworkError({ code: 'compatible_http_auth', stage: 'response', httpStatus: status })
  }
  if (status === 408 || status === 504) {
    return buildCompatibleNetworkError({ code: 'compatible_timeout', stage: 'response', httpStatus: status })
  }
  if (status === 429) {
    return buildCompatibleNetworkError({ code: 'compatible_http_rate_limit', stage: 'response', httpStatus: status })
  }
  return buildCompatibleNetworkError({ code: 'compatible_http_provider', stage: 'response', httpStatus: status })
}

function isCompatibleNetworkErrorRetryable(code: CompatibleNetworkErrorCode): boolean {
  return code === 'compatible_timeout' ||
    code === 'compatible_http_rate_limit' ||
    code === 'compatible_network_proxy_tls' ||
    code === 'compatible_network_unknown'
}
