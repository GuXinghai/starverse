#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = process.cwd()
const SCAN_ROOTS = ['electron', 'src', 'infra']
const INCLUDE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue'])
const IGNORED_DIR_NAMES = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'out',
  'release',
])

const NETWORK_RULES = [
  {
    id: 'global-this-fetch',
    description: 'globalThis.fetch defaults can bypass Electron session proxy policy',
    regex: /\bglobalThis\s*\.\s*fetch\b/u,
  },
  {
    id: 'bare-fetch-call',
    description: 'bare fetch(...) in production network paths bypasses the configured NetworkTransport',
    regex: /(?<![\w$.])fetch\s*\(/u,
  },
  {
    id: 'bare-fetch-default',
    description: 'defaulting to the ambient fetch function can bypass Electron session proxy policy',
    regex: /(?:\?\?|\|\||=)\s*fetch\b/u,
  },
  {
    id: 'node-http-import',
    description: 'node:http imports create a separate proxy surface from NetworkTransport',
    regex: /\b(?:from\s+['"]node:http['"]|import\s*\(\s*['"]node:http['"]\s*\)|require\s*\(\s*['"]node:http['"]\s*\))/u,
  },
  {
    id: 'node-https-import',
    description: 'node:https imports create a separate proxy surface from NetworkTransport',
    regex: /\b(?:from\s+['"]node:https['"]|import\s*\(\s*['"]node:https['"]\s*\)|require\s*\(\s*['"]node:https['"]\s*\))/u,
  },
  {
    id: 'axios-import',
    description: 'axios creates a separate proxy surface from NetworkTransport',
    regex: /\b(?:from\s+['"]axios['"]|import\s*\(\s*['"]axios['"]\s*\)|require\s*\(\s*['"]axios['"]\s*\))/u,
  },
  {
    id: 'undici-import',
    description: 'undici creates a separate proxy surface from Electron session transport',
    regex: /\b(?:from\s+['"]undici['"]|import\s*\(\s*['"]undici['"]\s*\)|require\s*\(\s*['"]undici['"]\s*\))/u,
  },
]

const CLASSIFIED_PRODUCTION_TRANSPORTS = [
  {
    id: 'compatible-provider-node-dual-transport',
    reason: 'canonical compatible broker preserves the explicitly selected manual/environment/direct Node-Undici route; system remains Electron session transport',
    path: /^electron\/net\/compatibleProviderTransport\.ts$/u,
    rules: ['undici-import'],
    line: /import\s+\{\s*fetch\s+as\s+undiciFetch\s*\}\s+from\s+['"]undici['"]/u,
  },
]

const ALLOWLIST = [
  {
    id: 'renderer-local-build-id',
    reason: 'renderer reads the local Vite build id; this is not external provider/catalog/download/local endpoint egress',
    path: /^src\/main\.ts$/u,
    rules: ['bare-fetch-call'],
    line: /fetch\(\s*['"]\/build-id\.json['"]/u,
  },
  {
    id: 'electron-session-provider-fetch-wrapper',
    reason: 'canonical provider wrapper uses Electron session.fetch so provider traffic follows Electron proxy policy',
    path: /^electron\/net\/providerHttpTransport\.ts$/u,
    rules: ['bare-fetch-call'],
    line: /\bsessionFetch\(/u,
  },
  {
    id: 'local-endpoint-direct-transport-wrapper',
    reason: 'canonical local endpoint wrapper centralizes the local direct policy and keeps tests injectable',
    path: /^electron\/net\/localEndpointTransport\.ts$/u,
    rules: ['global-this-fetch'],
    line: /input\?\.fetchImpl\s*\?\?\s*globalThis\.fetch/u,
  },
  {
    id: 'electron-bridge-file-ingestion-fallback',
    reason: 'file ingestion accepts injected Electron bridge fetch and keeps ambient fetch only as a non-Electron fallback',
    path: /^infra\/files\/fileIngestionService\.ts$/u,
    rules: ['global-this-fetch'],
    line: /this\.deps\.fetch\s*\?\?\s*globalThis\.fetch/u,
  },
  {
    id: 'url-probe-injectable-fallback',
    reason: 'urlProbe is an injectable utility; app callers are expected to provide the Electron transport',
    path: /^infra\/files\/urlProbe\.ts$/u,
    rules: ['global-this-fetch'],
    line: /options\.fetch\s*\?\?\s*globalThis\.fetch/u,
  },
  {
    id: 'official-package-node-fallback',
    reason: 'Node fallback downloader remains for CLI/tests/no Electron bridge and does not claim system/PAC support',
    path: /^(src\/next\/plugin-distribution\/packageDownloader|infra\/files\/enginePluginLifecycleService)\.ts$/u,
    rules: ['bare-fetch-call', 'bare-fetch-default'],
    line: /fetch\((?:input\.)?request\.transportRef|\(fetchImpl\s*\?\?\s*fetch\)\(sourceUrl/u,
  },
  {
    id: 'official-package-node-proxy-fallback',
    reason: 'undici is limited to the shared explicit Node fallback/manual/environment/direct proxy helper',
    path: /^src\/shared\/plugin-distribution\/networkProxy\.ts$/u,
    rules: ['undici-import'],
    line: /from\s+['"]undici['"]/u,
  },
  {
    id: 'dfc-official-asset-body-intercept-fallback',
    reason: 'DFC official asset body intercept is an env/test fallback around the package downloader contract',
    path: /^infra\/files\/dfcLibreOfficeOfficialAssetBodyIntercept\.ts$/u,
    rules: ['bare-fetch-call'],
    line: /fetch\(request\.transportRef/u,
  },
  {
    id: 'openrouter-provider-catalog-client-injectable-default',
    reason: 'OpenRouter provider catalog client remains injectable; Electron catalog sync must inject session fetch',
    path: /^src\/shared\/modelCatalog\/providers\/openrouter\/openRouterCatalogClient\.ts$/u,
    rules: ['bare-fetch-default'],
    line: /options\.fetchImpl\s*\?\?\s*fetch/u,
  },
  {
    id: 'openrouter-category-cache-injectable-default',
    reason: 'OpenRouter category cache remains injectable; Electron callers must inject session fetch',
    path: /^src\/next\/modelCatalog\/openRouterCategoryCache\.ts$/u,
    rules: ['bare-fetch-default'],
    line: /input\.fetchImpl\s*\?\?\s*fetch/u,
  },
  {
    id: 'openrouter-legacy-renderer-fetch-fallback',
    reason: 'legacy renderer OpenRouter fallback remains explicit; main Electron stream path uses the IPC/net.request bridge',
    path: /^src\/next\/transport\/(openrouterFetch|fetchGeneration)\.ts$/u,
    rules: ['bare-fetch-call'],
    line: /await\s+fetch\(url/u,
  },
  {
    id: 'image-url-fetch-existing-boundary',
    reason: 'existing image URL fetch boundary is outside provider/catalog/download/local endpoint migration scope',
    path: /^(electron\/ipc\/imageIpc\.ts|src\/ui-kit\/chat\/ChatMessageBubble\.vue)$/u,
    rules: ['bare-fetch-call'],
    line: /fetch\((imageUrl|url)\b/u,
  },
]

function toRepoPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function isTestOrMockPath(relPath) {
  return /(^|\/)(__tests__|__mocks__|mocks?|fixtures?|testUtils)(\/|$)/u.test(relPath) ||
    /(^|\/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$/u.test(relPath) ||
    /(^|\/)[^/]+\.(test|spec)\.vue$/u.test(relPath)
}

function isScriptPath(relPath) {
  return /^scripts\//u.test(relPath)
}

function isCommentOnlyLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function lineExcerpt(line) {
  const compact = line.trim().replace(/\s+/gu, ' ')
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}

function allowlistFor(relPath, line, ruleId) {
  if (isTestOrMockPath(relPath)) {
    return {
      id: 'test-and-mock-network-fixtures',
      reason: 'tests, mocks, and fixtures may mention direct network APIs to verify injection and failure behavior',
    }
  }
  if (isScriptPath(relPath)) {
    return {
      id: 'script-network-tools',
      reason: 'scripts are explicit tooling entrypoints and are outside app provider/catalog/download/local endpoint runtime',
    }
  }
  for (const entry of ALLOWLIST) {
    if (!entry.path.test(relPath)) continue
    if (!entry.rules.includes(ruleId)) continue
    if (entry.line && !entry.line.test(line)) continue
    return entry
  }
  return null
}

function classifiedProductionTransportFor(relPath, line, ruleId) {
  for (const entry of CLASSIFIED_PRODUCTION_TRANSPORTS) {
    if (!entry.path.test(relPath)) continue
    if (!entry.rules.includes(ruleId)) continue
    if (entry.line && !entry.line.test(line)) continue
    return entry
  }
  return null
}

function scanText(relPath, text) {
  const classified = []
  const allowed = []
  const violations = []
  const lines = text.split(/\r?\n/u)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (isCommentOnlyLine(line)) continue

    for (const rule of NETWORK_RULES) {
      rule.regex.lastIndex = 0
      if (!rule.regex.test(line)) continue

      const classification = classifiedProductionTransportFor(relPath, line, rule.id)
      const allow = classification ? null : allowlistFor(relPath, line, rule.id)
      const hit = {
        file: relPath,
        line: index + 1,
        rule: rule.id,
        description: rule.description,
        excerpt: lineExcerpt(line),
      }
      if (classification) {
        classified.push({ ...hit, classificationId: classification.id, reason: classification.reason })
      } else if (allow) {
        allowed.push({ ...hit, allowlistId: allow.id, reason: allow.reason })
      } else {
        violations.push({ ...hit, reason: 'unclassified network egress call in production source' })
      }
    }
  }

  return { classified, allowed, violations }
}

function walkFiles(dirAbs, files) {
  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIR_NAMES.has(entry.name)) walkFiles(abs, files)
      continue
    }

    if (!entry.isFile()) continue
    if (INCLUDE_EXTENSIONS.has(path.extname(entry.name))) files.push(abs)
  }
}

function collectFiles() {
  const files = []
  for (const root of SCAN_ROOTS) {
    walkFiles(path.join(REPO_ROOT, root), files)
  }
  return files
}

function scanRepo() {
  const files = collectFiles()
  const allowed = []
  const classified = []
  const violations = []

  for (const fileAbs of files) {
    const relPath = toRepoPath(path.relative(REPO_ROOT, fileAbs))
    let text
    try {
      text = fs.readFileSync(fileAbs, 'utf8')
    } catch {
      continue
    }
    const result = scanText(relPath, text)
    classified.push(...result.classified)
    allowed.push(...result.allowed)
    violations.push(...result.violations)
  }

  return { filesScanned: files.length, classified, allowed, violations }
}

function summarizeAllowed(allowed) {
  const counts = new Map()
  for (const hit of allowed) {
    counts.set(hit.allowlistId, (counts.get(hit.allowlistId) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function printResult(result) {
  console.log(`[network-egress-gate] scanned files=${result.filesScanned}`)
  console.log(`[network-egress-gate] classified production transport hits=${result.classified.length}`)
  for (const item of result.classified) {
    console.log(`  - ${item.classificationId}: ${item.file}:${item.line} (${item.reason})`)
  }
  console.log(`[network-egress-gate] allowed hits=${result.allowed.length}`)
  for (const [id, count] of summarizeAllowed(result.allowed)) {
    const allow = ALLOWLIST.find((entry) => entry.id === id)
    const reason = allow?.reason ?? 'allowed exception'
    console.log(`  - ${id}: ${count} (${reason})`)
  }

  if (result.violations.length > 0) {
    console.error(`\n[network-egress-gate] FAIL violations=${result.violations.length}`)
    for (const item of result.violations.slice(0, 100)) {
      console.error(`  - ${item.file}:${item.line} ${item.rule}`)
      console.error(`    ${item.description}`)
      console.error(`    ${item.excerpt}`)
    }
    if (result.violations.length > 100) {
      console.error(`  ... ${result.violations.length - 100} more violations`)
    }
    process.exitCode = 1
    return
  }

  console.log('\n[network-egress-gate] PASS no unclassified network egress calls')
}

function assertSelfTest(name, condition) {
  if (!condition) throw new Error(`self-test failed: ${name}`)
}

function runSelfTest() {
  const providerBareFetch = scanText(
    'electron/ipc/openAIResponsesTextChatIpc.ts',
    "const response = await fetch('https://api.openai.com/v1/responses')\n",
  )
  assertSelfTest('provider bare fetch is rejected', providerBareFetch.violations.some((hit) => hit.rule === 'bare-fetch-call'))

  const providerGlobalFetch = scanText(
    'electron/ipc/anthropicTextChatIpc.ts',
    'const fetchImpl = globalThis.fetch\n',
  )
  assertSelfTest('provider globalThis.fetch is rejected', providerGlobalFetch.violations.some((hit) => hit.rule === 'global-this-fetch'))

  const providerNodeHttps = scanText(
    'electron/ipc/deepSeekTextChatIpc.ts',
    "import https from 'node:https'\n",
  )
  assertSelfTest('provider node:https import is rejected', providerNodeHttps.violations.some((hit) => hit.rule === 'node-https-import'))

  const providerAxios = scanText(
    'src/next/provider/anthropic/anthropicAdapter.ts',
    "import axios from 'axios'\n",
  )
  assertSelfTest('provider axios import is rejected', providerAxios.violations.some((hit) => hit.rule === 'axios-import'))

  const providerUndici = scanText(
    'src/next/provider/deepseek/deepSeekAdapter.ts',
    "import { fetch as undiciFetch } from 'undici'\n",
  )
  assertSelfTest('provider undici import is rejected', providerUndici.violations.some((hit) => hit.rule === 'undici-import'))

  const compatibleUndici = scanText(
    'electron/net/compatibleProviderTransport.ts',
    "import { fetch as undiciFetch } from 'undici'\n",
  )
  assertSelfTest('compatible canonical Node transport is classified', compatibleUndici.classified.length === 1)
  assertSelfTest('compatible canonical Node transport is not allowlisted', compatibleUndici.allowed.length === 0)
  assertSelfTest('compatible canonical Node transport has no violation', compatibleUndici.violations.length === 0)

  const compatibleUndiciElsewhere = scanText(
    'electron/ipc/compatibleProviderTransportIpc.ts',
    "import { fetch as undiciFetch } from 'undici'\n",
  )
  assertSelfTest('compatible Undici outside canonical broker is rejected', compatibleUndiciElsewhere.violations.length === 1)

  const localWrapper = scanText(
    'electron/net/localEndpointTransport.ts',
    'const fetchImpl = input?.fetchImpl ?? globalThis.fetch\n',
  )
  assertSelfTest('local endpoint direct wrapper is allowlisted', localWrapper.violations.length === 0)
  assertSelfTest('local endpoint direct wrapper records allowed hit', localWrapper.allowed.length === 1)

  const nodeFallback = scanText(
    'src/next/plugin-distribution/packageDownloader.ts',
    'response = await fetch(request.transportRef, init)\n',
  )
  assertSelfTest('node fallback downloader is allowlisted', nodeFallback.violations.length === 0)
  assertSelfTest('node fallback downloader records allowed hit', nodeFallback.allowed.length === 1)

  const testFixture = scanText(
    'electron/ipc/openAIResponsesTextChatIpc.test.ts',
    "const response = await fetch('https://example.test')\n",
  )
  assertSelfTest('test fixture is allowlisted', testFixture.violations.length === 0)

  console.log(`[network-egress-gate] self-test PASS on ${os.platform()}`)
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  printResult(scanRepo())
}
