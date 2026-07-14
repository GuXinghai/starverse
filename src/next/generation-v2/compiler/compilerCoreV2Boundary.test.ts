import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(path.resolve(relativePath), 'utf8')
}

function productionSources(root: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      result.push(...productionSources(absolute))
    } else if (/\.(?:ts|tsx|vue)$/u.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)) {
      result.push(absolute)
    }
  }
  return result
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const expression = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|^\s*import\s*)['"]([^'"]+)['"]/gmu
  for (const match of source.matchAll(expression)) specifiers.push(match[1])
  return specifiers
}

describe('Generation Compiler V2 core boundary', () => {
  it('has no dependency on V1 UI config, wire mappers, builders, adapters or transports', () => {
    for (const file of [
      'src/next/generation-v2/compiler/stableSerialize.ts',
      'src/next/generation-v2/domain/identityV2.ts',
      'src/next/generation-v2/domain/generationIntentV2.ts',
      'src/next/generation-v2/domain/providerBindingV2.ts',
      'src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2.ts',
      'src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2.ts',
      'src/next/generation-v2/providers/openrouter-images/descriptorFreshnessSettingsV2.ts',
      'src/next/generation-v2/providers/openrouter-images/descriptorFreshnessDecisionV2.ts',
      'src/next/generation-v2/credential/credentialScopeV2.ts',
      'src/next/generation-v2/contracts/providerContractRegistryV2.ts',
    ]) {
      expect(read(file), file).not.toMatch(/chatSessionConfig|appChatApp\.logic|generation-params|wirePath|requestPatch|extraBody|runtimeProviderAdapter|StreamBridge|TextChat/iu)
    }
  })

  it('is not activated by legacy startup, schema, worker, IPC, UI or transport paths', () => {
    for (const file of [
      'electron/main.ts',
      'electron/preload.ts',
      'electron/ipc/registerIpc.ts',
      'infra/db/schema.sql',
      'infra/db/dbMethodsRegistry.ts',
      'infra/db/worker/runtime.ts',
      'src/ui-app/app/appChatApp.logic.ts',
      'src/next/openrouter/buildRequest.ts',
      'electron/ipc/openRouterStreamBridge.ts',
    ]) {
      expect(read(file), file).not.toMatch(/generation-v2/iu)
    }
  })

  it('has no production import, export, require or dynamic-import edge outside the V2 package', () => {
    const packageRoot = path.resolve('src/next/generation-v2')
    const inactiveV2Adapters = new Set([
      path.resolve('infra/db/repo/openRouterImageEndpointRepo.ts'),
      path.resolve('infra/db/repo/openRouterImageSettingsRepo.ts'),
      path.resolve('infra/db/repo/openRouterImageBindingRepo.ts'),
    ])
    for (const root of ['electron', 'infra', 'src']) {
      for (const file of productionSources(path.resolve(root))) {
        if (file === packageRoot || file.startsWith(`${packageRoot}${path.sep}`)) continue
        if (inactiveV2Adapters.has(file)) continue
        for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
          const targetsPackage = specifier.includes('generation-v2') ||
            (specifier.startsWith('.') && path.resolve(path.dirname(file), specifier).startsWith(packageRoot))
          expect(targetsPackage, `${path.relative(process.cwd(), file)} -> ${specifier}`).toBe(false)
        }
      }
    }
  })

  it('keeps the inactive V2 descriptor repository adapter out of startup and legacy production imports', () => {
    const adapters = new Set([
      path.resolve('infra/db/repo/openRouterImageEndpointRepo.ts'),
      path.resolve('infra/db/repo/openRouterImageSettingsRepo.ts'),
      path.resolve('infra/db/repo/openRouterImageBindingRepo.ts'),
    ])
    for (const root of ['electron', 'infra', 'src']) {
      for (const file of productionSources(path.resolve(root))) {
        if (adapters.has(file)) continue
        expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
          .not.toMatch(/openRouterImage(?:Endpoint|Settings|Binding)Repo/iu)
      }
    }
  })

  it('does not allow the decoded unverified binding record to become compiler or snapshot authority', () => {
    const recordModule = path.resolve('src/next/generation-v2/domain/providerBindingV2.ts')
    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === recordModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/DecodedProviderBindingRecordV2|decodeProviderBindingRecordV2/u)
    }
  })

  it('does not allow repository-decoded descriptor facts to become compiler or snapshot authority', () => {
    const factModule = path.resolve('src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2.ts')
    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === factModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/DecodedOpenRouterImageDescriptorCacheRecordV2|decodeOpenRouterImageDescriptorCacheRecordV2/u)
    }
  })

  it('keeps reviewed contract definitions non-executable and out of legacy transport selection', () => {
    const registryModule = path.resolve('src/next/generation-v2/contracts/providerContractRegistryV2.ts')
    const registry = read('src/next/generation-v2/contracts/providerContractRegistryV2.ts')
    expect(registry).toMatch(/implementationStatus: 'definition_only'/u)
    expect(registry).toMatch(/executionAuthority: 'none'/u)
    expect(registry).not.toMatch(/ResolvedProviderContract|issueResolved|fetch\(|runtimeSelection|StreamBridge/iu)
    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === registryModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/providerContractRegistryV2|ReviewedProviderContractDefinitionV2/iu)
    }
  })
})
