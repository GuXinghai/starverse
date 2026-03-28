import { readApprovedDebugFlag } from '@/shared/diagnostics/flags'

export function isStreamErrorDebugEnabled(): boolean {
  return readApprovedDebugFlag('streamError')
}

export function isTimingDebugEnabled(): boolean {
  return readApprovedDebugFlag('timing')
}

export function resolveStreamDebugPatch(
  options?: Readonly<{ devRuntime?: boolean }>,
): Readonly<{ debug?: { echoUpstreamBody: true } }> {
  if (!readApprovedDebugFlag('openrouterEchoUpstreamBody', options)) return {}
  return { debug: { echoUpstreamBody: true } }
}
