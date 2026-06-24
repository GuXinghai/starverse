#!/usr/bin/env node
const sourceUrl = 'https://github.com/GuXinghai/starverse/releases/download/starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg'
const expectedSize = 518907010
const allowedHosts = new Set(['github.com', 'release-assets.githubusercontent.com'])

function hostAllowed(value) {
  try {
    return allowedHosts.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

function diagnosticFor(error) {
  const code = String(error?.cause?.code ?? error?.code ?? error?.message ?? '').toLowerCase()
  if (/timeout|timedout|etimedout|abort/u.test(code)) return 'proxy_connection_timeout'
  if (/auth/u.test(code)) return 'proxy_auth_required'
  return 'metadata_reachable_head_failed'
}

async function main() {
  const result = {
    sourceKind: 'github_release_asset',
    proxyMode: 'node_default_transport',
    metadataReachable: true,
    assetFound: true,
    headPassed: false,
    contentLength: 'unavailable',
    redirectHostAllowed: false,
    rangePassed: false,
    terminalDiagnostic: 'metadata_reachable_head_failed',
  }

  let head
  try {
    head = await fetch(sourceUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    result.terminalDiagnostic = diagnosticFor(error)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = 1
    return
  }

  const contentLength = Number(head.headers.get('content-length') ?? NaN)
  result.headPassed = head.ok
  result.redirectHostAllowed = hostAllowed(head.url)
  result.contentLength = Number.isFinite(contentLength)
    ? (contentLength === expectedSize ? 'match' : 'mismatch')
    : 'unavailable'
  if (!head.ok || !result.redirectHostAllowed || result.contentLength !== 'match') {
    result.terminalDiagnostic = result.redirectHostAllowed ? 'metadata_reachable_head_failed' : 'asset_host_blocked'
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = 1
    return
  }

  try {
    const range = await fetch(sourceUrl, {
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    const body = new Uint8Array(await range.arrayBuffer())
    result.redirectHostAllowed = hostAllowed(range.url)
    result.rangePassed = range.status === 206 && result.redirectHostAllowed && body.byteLength === 1024
    result.terminalDiagnostic = result.rangePassed ? 'proxy_probe_passed' : 'range_failed'
  } catch (error) {
    result.terminalDiagnostic = diagnosticFor(error) === 'proxy_connection_timeout'
      ? 'proxy_connection_timeout'
      : 'range_failed'
  }

  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.rangePassed ? 0 : 1
}

await main()
