#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const descriptorPath = path.join(repoRoot, 'infra', 'files', 'dfcManagedLibreOfficeRuntime.ts')
const timeoutMs = Number(process.env.STARVERSE_DFC_M48_METADATA_TIMEOUT_MS ?? 20_000)
const rangeProbeEnabled = process.env.STARVERSE_DFC_M48_RANGE_PROBE === '1'
const allowedRedirectHosts = new Set(['github.com', 'release-assets.githubusercontent.com'])

async function main() {
  const descriptor = await readOfficialDescriptor()
  const evidence = {
    type: 'dfc-m48-libreoffice-official-install-reliability-diagnosis',
    installedStateRecheck: 'not_run_by_metadata_probe',
    sourceKind: descriptor.sourceKind,
    arbitraryUrlInput: 'not_used',
    releaseMetadata: {
      reachable: false,
      expectedTagFound: false,
      assetFound: false,
      sizeMetadata: 'unavailable',
      terminalDiagnostic: null,
    },
    headProbe: {
      attempted: true,
      reachable: false,
      redirect: 'not_observed',
      contentLength: 'unavailable',
      terminalDiagnostic: null,
    },
    rangeProbe: {
      attempted: rangeProbeEnabled,
      result: rangeProbeEnabled ? 'not_run' : 'skipped_by_default',
      terminalDiagnostic: null,
    },
    privacy: {
      rawUrlPrinted: false,
      fullHashPrinted: false,
      responseBodyPrinted: false,
    },
  }

  const release = parsePackageRef(descriptor.packageRef)
  if (!release.ok) {
    evidence.releaseMetadata.terminalDiagnostic = release.code
    printEvidence(evidence)
    process.exitCode = 1
    return
  }

  const releaseMetadata = await fetchReleaseMetadata(release.value)
  evidence.releaseMetadata = releaseMetadata
  const head = await runHeadProbe(descriptor.sourceUrl, descriptor.expectedSizeBytes)
  evidence.headProbe = head
  if (rangeProbeEnabled) {
    evidence.rangeProbe = await runRangeProbe(descriptor.sourceUrl)
  }

  printEvidence(evidence)
  if (!releaseMetadata.reachable || !releaseMetadata.expectedTagFound || !releaseMetadata.assetFound) {
    process.exitCode = 1
  }
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
    !Number.isFinite(descriptor.expectedSizeBytes) ||
    descriptor.expectedSizeBytes <= 0
  ) {
    throw new Error('official_descriptor_invalid')
  }
  return descriptor
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
        'User-Agent': 'Starverse-DFC-M48-Metadata-Diagnosis',
      },
    })
    if (!response.ok) {
      return releaseEvidence(false, false, false, 'unavailable', `github_metadata_http_${response.status}`)
    }
    const json = await response.json()
    const assets = Array.isArray(json.assets) ? json.assets : []
    const asset = assets.find((item) => item?.name === release.assetName) ?? null
    return releaseEvidence(
      true,
      json.tag_name === release.tag,
      Boolean(asset),
      typeof asset?.size === 'number' && Number.isFinite(asset.size) ? `bytes_${asset.size}` : 'unavailable',
      asset ? null : 'asset_not_found'
    )
  } catch (error) {
    return releaseEvidence(false, false, false, 'unavailable', classifyFetchError(error))
  }
}

async function runHeadProbe(sourceUrl, expectedSizeBytes) {
  try {
    const manual = await fetchWithTimeout(sourceUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Starverse-DFC-M48-Metadata-Diagnosis' },
    })
    const location = manual.headers.get('location')
    const redirect = location ? classifyRedirect(location) : 'not_observed'
    const followed = await fetchWithTimeout(sourceUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Starverse-DFC-M48-Metadata-Diagnosis' },
    })
    if (!followed.ok) {
      return headEvidence(false, redirect, 'unavailable', `head_http_${followed.status}`)
    }
    const contentLength = parseContentLength(followed.headers.get('content-length'))
    return headEvidence(
      true,
      redirect,
      contentLength === expectedSizeBytes ? 'match' : (contentLength === null ? 'unavailable' : 'mismatch'),
      null
    )
  } catch (error) {
    return headEvidence(false, 'unknown', 'unavailable', classifyFetchError(error))
  }
}

async function runRangeProbe(sourceUrl) {
  const controller = new AbortController()
  try {
    const response = await fetchWithTimeout(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Range: 'bytes=0-1023',
        'User-Agent': 'Starverse-DFC-M48-Metadata-Diagnosis',
      },
    })
    if (response.status !== 206) {
      controller.abort()
      await response.body?.cancel().catch(() => undefined)
      return { attempted: true, result: `unexpected_http_${response.status}`, terminalDiagnostic: 'range_not_partial_content' }
    }
    const reader = response.body?.getReader()
    const chunk = await reader?.read()
    await reader?.cancel().catch(() => undefined)
    const length = chunk?.value?.byteLength ?? 0
    return {
      attempted: true,
      result: length > 0 && length <= 1024 ? 'passed' : 'failed',
      terminalDiagnostic: length > 0 && length <= 1024 ? null : 'range_probe_size_invalid',
    }
  } catch (error) {
    return { attempted: true, result: 'failed', terminalDiagnostic: classifyFetchError(error) }
  } finally {
    controller.abort()
  }
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

function releaseEvidence(reachable, expectedTagFound, assetFound, sizeMetadata, terminalDiagnostic) {
  return { reachable, expectedTagFound, assetFound, sizeMetadata, terminalDiagnostic }
}

function headEvidence(reachable, redirect, contentLength, terminalDiagnostic) {
  return { attempted: true, reachable, redirect, contentLength, terminalDiagnostic }
}

function parseContentLength(value) {
  const parsed = Number(value ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function classifyRedirect(value) {
  try {
    const host = new URL(value).host.toLowerCase()
    return allowedRedirectHosts.has(host) ? 'accepted_allowed_host' : 'rejected_unapproved_host'
  } catch {
    return 'rejected_invalid_location'
  }
}

function classifyFetchError(error) {
  if (error?.name === 'AbortError') return 'network_timeout'
  const code = String(error?.cause?.code ?? error?.code ?? '').trim()
  if (/^[A-Z0-9_:-]{1,80}$/u.test(code)) return `network_${code.toLowerCase()}`
  return 'network_fetch_failed'
}

function extractString(source, pattern) {
  return pattern.exec(source)?.[1] ?? ''
}

function printEvidence(evidence) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

main().catch((error) => {
  const message = String(error?.message ?? '')
  process.stderr.write(`${JSON.stringify({
    type: 'dfc-m48-libreoffice-official-install-reliability-diagnosis-error',
    diagnostic: /^[a-z0-9_:-]{1,80}$/iu.test(message) ? message : classifyFetchError(error),
  })}\n`)
  process.exitCode = 1
})
