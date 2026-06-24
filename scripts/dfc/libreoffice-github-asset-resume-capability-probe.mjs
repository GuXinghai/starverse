#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const descriptorPath = path.join(repoRoot, 'infra', 'files', 'dfcManagedLibreOfficeRuntime.ts')
const timeoutMs = Number(process.env.STARVERSE_DFC_M53_RESUME_PROBE_TIMEOUT_MS ?? 20_000)
const expectedTotalBytes = 518_907_010
const allowedRedirectHosts = new Set(['github.com', 'release-assets.githubusercontent.com'])
const userAgent = 'Starverse-DFC-M53-Resume-Capability-Probe'

async function main() {
  const descriptor = await readOfficialDescriptor()
  const release = parsePackageRef(descriptor.packageRef)
  const evidence = createEvidence(descriptor)

  if (!release.ok) {
    evidence.releaseMetadata.terminalDiagnostic = release.code
    evidence.finalClassification = 'resume_probe_failed'
    printEvidence(evidence)
    process.exitCode = 1
    return
  }

  const metadata = await fetchReleaseMetadata(release.value)
  evidence.releaseMetadata = sanitizeReleaseMetadata(metadata)
  evidence.headProbe = await runHeadProbe(descriptor.sourceUrl, descriptor.expectedSizeBytes)

  if (metadata.reachable) {
    evidence.directDownloadUrlRanges = await runRangeSuite('browser_download_url', descriptor.sourceUrl, descriptor.expectedSizeBytes)
    evidence.firstRangeDeterministic = await runDeterministicFirstRangeCheck(descriptor.sourceUrl)

    const redirectLocation = evidence.headProbe.redirectLocationClass === 'allowed_asset_host' ? evidence.headProbe.redirectLocation : null
    if (redirectLocation) {
      evidence.redirectFinalHostRanges = await runRangeSuite('final_redirect_asset_host', redirectLocation, descriptor.expectedSizeBytes)
      evidence.redirectFinalHostRanges.attempted = true
    }

    if (metadata.assetApiUrl) {
      evidence.githubAssetApiRanges = await runRangeSuite(
        'github_asset_api_octet_stream',
        metadata.assetApiUrl,
        descriptor.expectedSizeBytes,
        { acceptOctetStream: true }
      )
      evidence.githubAssetApiRanges.attempted = true
    }
  }

  evidence.finalClassification = classifyResumeCapability(evidence)
  evidence.m54ImplementationRecommendation = evidence.finalClassification === 'resume_supported' ||
    evidence.finalClassification === 'resume_supported_after_redirect'
      ? 'implement_resume_in_m54'
      : 'do_not_implement_resume_until_supported'
  evidence.privacy = {
    rawUrlPrinted: false,
    tokenPrinted: false,
    commandLinePrinted: false,
    fullHashPrinted: false,
    localPathPrinted: false,
    responseBodyPrinted: false,
    packageBodyDownloaded: false,
  }

  printEvidence(redactInternalFields(evidence))
  if (evidence.finalClassification === 'resume_probe_failed') process.exitCode = 1
}

async function readOfficialDescriptor() {
  const source = await readFile(descriptorPath, 'utf8')
  const acquisitionSource = /acquisitionSource:\s*\{(?<body>[\s\S]*?)\n\s*\},\n\s*trustPolicy:/u.exec(source)?.groups?.body ?? ''
  const descriptor = {
    sourceKind: extractString(acquisitionSource, /sourceKind:\s*'([^']+)'/u),
    packageRef: extractString(source, /packageRef:\s*'([^']+starverse-runtime-libreoffice[^']+\.svpkg)'/u),
    sourceUrl: extractString(source, /sourceUrl:\s*'([^']+starverse-runtime-libreoffice[^']+\.svpkg)'/u),
    expectedSha256: extractString(source, /expectedSha256:\s*'([a-f0-9]{64})'/u),
    expectedSizeBytes: Number(extractString(source, /expectedSizeBytes:\s*(\d+)/u)),
  }
  if (
    descriptor.sourceKind !== 'github_release_asset' ||
    !descriptor.packageRef ||
    !descriptor.sourceUrl ||
    !/^[a-f0-9]{64}$/u.test(descriptor.expectedSha256) ||
    descriptor.expectedSizeBytes !== expectedTotalBytes
  ) {
    throw new Error('official_descriptor_invalid')
  }
  return descriptor
}

function createEvidence(descriptor) {
  return {
    type: 'dfc-m53-github-asset-resume-capability-probe',
    sourceKind: descriptor.sourceKind,
    arbitraryUrlInput: 'not_used',
    expectedSizeClass: `bytes_${descriptor.expectedSizeBytes}`,
    releaseMetadata: {
      reachable: false,
      expectedTagFound: false,
      assetFound: false,
      sizeMetadata: 'unavailable',
      terminalDiagnostic: null,
    },
    headProbe: {
      attempted: true,
      passed: false,
      statusClass: 'not_run',
      contentLengthPresent: false,
      contentLengthMatch: 'unavailable',
      acceptRanges: 'absent',
      redirectHost: 'not_observed',
      redirectLocationClass: 'not_observed',
      terminalDiagnostic: null,
      redirectLocation: null,
    },
    directDownloadUrlRanges: createRangeSuiteEvidence('browser_download_url'),
    redirectFinalHostRanges: createRangeSuiteEvidence('final_redirect_asset_host', false),
    githubAssetApiRanges: createRangeSuiteEvidence('github_asset_api_octet_stream', false),
    firstRangeDeterministic: {
      attempted: false,
      deterministic: 'not_run',
      terminalDiagnostic: null,
    },
    finalClassification: 'resume_probe_failed',
    m54ImplementationRecommendation: 'do_not_implement_resume_until_supported',
    privacy: {},
  }
}

function createRangeSuiteEvidence(mode, attempted = true) {
  return {
    mode,
    attempted,
    firstRange: emptyRangeEvidence('bytes=0-1023'),
    midRange: emptyRangeEvidence('bytes=259453505-259454528'),
    tailRange: emptyRangeEvidence('bytes=518906986-518907009'),
    summary: 'not_run',
    terminalDiagnostic: null,
  }
}

function emptyRangeEvidence(rangeClass) {
  return {
    rangeClass,
    attempted: false,
    statusClass: 'not_run',
    partialContent: false,
    bodyLength: 'not_read',
    contentRange: 'not_observed',
    totalSizeMatch: 'unavailable',
    terminalDiagnostic: null,
  }
}

function parsePackageRef(packageRef) {
  const match = /^([^/\s]+\/[^@\s]+)@([^/\s]+)\/([^\s]+\.svpkg)$/u.exec(packageRef)
  if (!match) return { ok: false, code: 'package_ref_invalid' }
  return {
    ok: true,
    value: {
      repo: match[1],
      tag: match[2],
      assetName: match[3],
    },
  }
}

async function fetchReleaseMetadata(release) {
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${release.repo}/releases/tags/${release.tag}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': userAgent,
      },
    })
    if (!response.ok) {
      return releaseEvidence(false, false, false, 'unavailable', `github_metadata_http_${response.status}`, null)
    }
    const json = await response.json()
    const assets = Array.isArray(json.assets) ? json.assets : []
    const asset = assets.find((item) => item?.name === release.assetName) ?? null
    return releaseEvidence(
      true,
      json.tag_name === release.tag,
      Boolean(asset),
      typeof asset?.size === 'number' && Number.isFinite(asset.size) ? `bytes_${asset.size}` : 'unavailable',
      asset ? null : 'asset_not_found',
      typeof asset?.url === 'string' ? asset.url : null
    )
  } catch (error) {
    return releaseEvidence(false, false, false, 'unavailable', classifyFetchError(error), null)
  }
}

function releaseEvidence(reachable, expectedTagFound, assetFound, sizeMetadata, terminalDiagnostic, assetApiUrl) {
  return { reachable, expectedTagFound, assetFound, sizeMetadata, terminalDiagnostic, assetApiUrl }
}

function sanitizeReleaseMetadata(metadata) {
  return {
    reachable: metadata.reachable,
    expectedTagFound: metadata.expectedTagFound,
    assetFound: metadata.assetFound,
    sizeMetadata: metadata.sizeMetadata,
    terminalDiagnostic: metadata.terminalDiagnostic,
  }
}

async function runHeadProbe(sourceUrl, expectedSizeBytes) {
  const evidence = {
    attempted: true,
    passed: false,
    statusClass: 'not_run',
    contentLengthPresent: false,
    contentLengthMatch: 'unavailable',
    acceptRanges: 'absent',
    redirectHost: 'not_observed',
    redirectLocationClass: 'not_observed',
    terminalDiagnostic: null,
    redirectLocation: null,
  }
  try {
    const manual = await fetchWithTimeout(sourceUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': userAgent },
    })
    evidence.statusClass = `http_${manual.status}`
    const location = manual.headers.get('location')
    if (location) {
      const redirect = classifyRedirect(location)
      evidence.redirectHost = redirect.hostClass
      evidence.redirectLocationClass = redirect.locationClass
      evidence.redirectLocation = redirect.locationClass === 'allowed_asset_host' ? location : null
    }

    const followed = await fetchWithTimeout(sourceUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': userAgent },
    })
    evidence.statusClass = `http_${followed.status}`
    if (!followed.ok) {
      evidence.terminalDiagnostic = `head_http_${followed.status}`
      return evidence
    }
    const contentLength = parseContentLength(followed.headers.get('content-length'))
    evidence.contentLengthPresent = contentLength !== null
    evidence.contentLengthMatch = contentLength === expectedSizeBytes ? 'match' : (contentLength === null ? 'unavailable' : 'mismatch')
    evidence.acceptRanges = parseHeaderPresence(followed.headers.get('accept-ranges'))
    evidence.passed = evidence.contentLengthMatch === 'match'
    return evidence
  } catch (error) {
    evidence.statusClass = 'network_failed'
    evidence.redirectHost = 'unknown'
    evidence.redirectLocationClass = 'unknown'
    evidence.terminalDiagnostic = classifyFetchError(error)
    return evidence
  }
}

async function runRangeSuite(mode, url, expectedSizeBytes, options = {}) {
  const suite = createRangeSuiteEvidence(mode)
  suite.firstRange = await runRangeProbe(url, 'bytes=0-1023', 1024, expectedSizeBytes, options)
  suite.midRange = await runRangeProbe(url, 'bytes=259453505-259454528', 1024, expectedSizeBytes, options)
  suite.tailRange = await runRangeProbe(url, 'bytes=518906986-518907009', 24, expectedSizeBytes, options)
  suite.summary = summarizeRangeSuite(suite)
  suite.terminalDiagnostic = suite.summary === 'passed' ? null : firstRangeDiagnostic(suite)
  return suite
}

async function runDeterministicFirstRangeCheck(url) {
  const first = await readRangeBytes(url, 'bytes=0-1023', 1024)
  if (!first.ok) {
    return { attempted: true, deterministic: 'failed', terminalDiagnostic: first.diagnostic }
  }
  const second = await readRangeBytes(url, 'bytes=0-1023', 1024)
  if (!second.ok) {
    return { attempted: true, deterministic: 'failed', terminalDiagnostic: second.diagnostic }
  }
  return {
    attempted: true,
    deterministic: buffersEqual(first.bytes, second.bytes) ? 'match' : 'mismatch',
    terminalDiagnostic: buffersEqual(first.bytes, second.bytes) ? null : 'range_bytes_mismatch',
  }
}

async function runRangeProbe(url, rangeHeader, expectedBodyLength, expectedSizeBytes, options = {}) {
  const evidence = emptyRangeEvidence(rangeHeader)
  evidence.attempted = true
  const result = await readRangeBytes(url, rangeHeader, expectedBodyLength, options)
  evidence.statusClass = result.statusClass
  evidence.partialContent = result.status === 206
  evidence.bodyLength = result.bodyLengthClass
  evidence.contentRange = classifyContentRange(result.contentRange, rangeHeader, expectedSizeBytes, expectedBodyLength)
  evidence.totalSizeMatch = evidence.contentRange === 'valid_total_match' ? 'match' :
    (evidence.contentRange === 'valid_total_mismatch' ? 'mismatch' : 'unavailable')
  evidence.terminalDiagnostic = result.ok ? null : result.diagnostic
  return evidence
}

async function readRangeBytes(url, rangeHeader, expectedBodyLength, options = {}) {
  const headers = {
    Range: rangeHeader,
    'User-Agent': userAgent,
  }
  if (options.acceptOctetStream) headers.Accept = 'application/octet-stream'

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
    })
    const statusClass = `http_${response.status}`
    const contentRange = response.headers.get('content-range')
    if (response.status === 200) {
      await response.body?.cancel().catch(() => undefined)
      return {
        ok: false,
        status: response.status,
        statusClass,
        contentRange,
        bodyLengthClass: 'not_read_range_ignored',
        bytes: new Uint8Array(0),
        diagnostic: 'range_ignored_no_resume',
      }
    }
    if (response.status === 416) {
      await response.body?.cancel().catch(() => undefined)
      return {
        ok: false,
        status: response.status,
        statusClass,
        contentRange,
        bodyLengthClass: 'not_read_range_rejected',
        bytes: new Uint8Array(0),
        diagnostic: 'range_rejected',
      }
    }
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      return {
        ok: false,
        status: response.status,
        statusClass,
        contentRange,
        bodyLengthClass: 'not_read_unexpected_status',
        bytes: new Uint8Array(0),
        diagnostic: `range_http_${response.status}`,
      }
    }
    const bytes = await readBoundedBody(response, expectedBodyLength + 1)
    const validLength = bytes.byteLength === expectedBodyLength
    return {
      ok: validLength,
      status: response.status,
      statusClass,
      contentRange,
      bodyLengthClass: `bytes_${bytes.byteLength}`,
      bytes,
      diagnostic: validLength ? null : 'range_body_length_invalid',
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusClass: 'network_failed',
      contentRange: null,
      bodyLengthClass: 'not_read_network_failed',
      bytes: new Uint8Array(0),
      diagnostic: classifyFetchError(error),
    }
  }
}

async function readBoundedBody(response, maxBytes) {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      const remaining = maxBytes - total
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      chunks.push(chunk)
      total += chunk.byteLength
      if (value.byteLength > remaining) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function summarizeRangeSuite(suite) {
  const ranges = [suite.firstRange, suite.midRange, suite.tailRange]
  if (ranges.every((item) => item.partialContent && item.contentRange === 'valid_total_match' && item.terminalDiagnostic === null)) {
    return 'passed'
  }
  if (ranges.some((item) => item.terminalDiagnostic === 'range_ignored_no_resume')) return 'range_ignored_no_resume'
  if (ranges.some((item) => item.terminalDiagnostic === 'range_rejected')) return 'range_rejected'
  if (ranges.some((item) => item.statusClass === 'network_failed')) return 'network_failed'
  return 'failed'
}

function firstRangeDiagnostic(suite) {
  return [suite.firstRange, suite.midRange, suite.tailRange].find((item) => item.terminalDiagnostic)?.terminalDiagnostic ?? suite.summary
}

function classifyResumeCapability(evidence) {
  if (!evidence.releaseMetadata.reachable || !evidence.releaseMetadata.assetFound) return 'resume_probe_failed'
  const directPassed = evidence.directDownloadUrlRanges.summary === 'passed' &&
    evidence.firstRangeDeterministic.deterministic === 'match'
  const redirectPassed = evidence.redirectFinalHostRanges.summary === 'passed'
  const apiPassed = evidence.githubAssetApiRanges.summary === 'passed'
  if (directPassed) return 'resume_supported'
  if (redirectPassed || apiPassed) return 'resume_supported_after_redirect'

  const summaries = [
    evidence.directDownloadUrlRanges.summary,
    evidence.redirectFinalHostRanges.summary,
    evidence.githubAssetApiRanges.summary,
  ]
  if (summaries.includes('range_ignored_no_resume')) return 'resume_not_supported_range_ignored'
  if (summaries.includes('range_rejected')) return 'resume_not_supported_range_rejected'
  if (summaries.includes('network_failed') || evidence.headProbe.statusClass === 'network_failed') return 'resume_inconclusive_network_unstable'
  if (evidence.headProbe.acceptRanges === 'absent' || evidence.headProbe.contentLengthPresent === false) return 'resume_inconclusive_header_missing'
  return 'resume_probe_failed'
}

function classifyContentRange(value, rangeHeader, expectedSizeBytes, expectedBodyLength) {
  if (!value) return 'missing'
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/iu.exec(value.trim())
  if (!match) return 'invalid'
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  const requested = /^bytes=(\d+)-(\d+)$/u.exec(rangeHeader)
  if (!requested) return 'invalid'
  const requestedStart = Number(requested[1])
  const requestedEnd = Number(requested[2])
  if (start !== requestedStart || end !== requestedEnd || end - start + 1 !== expectedBodyLength) return 'invalid'
  return total === expectedSizeBytes ? 'valid_total_match' : 'valid_total_mismatch'
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const upstreamSignal = init.signal
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason)
    else upstreamSignal.addEventListener('abort', () => controller.abort(upstreamSignal.reason), { once: true })
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function classifyRedirect(value) {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()
    if (!allowedRedirectHosts.has(host)) {
      return { hostClass: 'rejected_unapproved_host', locationClass: 'rejected' }
    }
    return {
      hostClass: host === 'release-assets.githubusercontent.com' ? 'release_assets_githubusercontent' : 'github',
      locationClass: host === 'release-assets.githubusercontent.com' ? 'allowed_asset_host' : 'allowed_github_host',
    }
  } catch {
    return { hostClass: 'rejected_invalid_location', locationClass: 'rejected' }
  }
}

function parseHeaderPresence(value) {
  if (!value) return 'absent'
  return value.toLowerCase().includes('bytes') ? 'bytes' : 'present_non_bytes'
}

function parseContentLength(value) {
  const parsed = Number(value ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function classifyFetchError(error) {
  if (error?.name === 'AbortError') return 'network_timeout'
  const code = String(error?.cause?.code ?? error?.code ?? '').trim()
  if (/^[A-Z0-9_:-]{1,80}$/u.test(code)) return `network_${code.toLowerCase()}`
  return 'network_fetch_failed'
}

function buffersEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false
  for (let i = 0; i < left.byteLength; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

function extractString(source, pattern) {
  return pattern.exec(source)?.[1] ?? ''
}

function redactInternalFields(evidence) {
  const copy = JSON.parse(JSON.stringify(evidence))
  delete copy.headProbe.redirectLocation
  return copy
}

function printEvidence(evidence) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

main().catch((error) => {
  const message = String(error?.message ?? '')
  process.stderr.write(`${JSON.stringify({
    type: 'dfc-m53-github-asset-resume-capability-probe-error',
    diagnostic: /^[a-z0-9_:-]{1,80}$/iu.test(message) ? message : classifyFetchError(error),
  })}\n`)
  process.exitCode = 1
})
