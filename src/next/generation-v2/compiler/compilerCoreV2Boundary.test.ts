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
      'src/next/generation-v2/providers/openrouter-images/imageIntentCapabilityProjectionV2.ts',
      'src/next/generation-v2/providers/openrouter-images/selectionDecisionV2.ts',
      'src/next/generation-v2/providers/lmstudio-openresponses/nativeItemsV1.ts',
      'src/next/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1.ts',
      'src/next/generation-v2/providers/deepseek/nativeMessagesV1.ts',
      'src/next/generation-v2/providers/deepseek/chatRequestV1.ts',
      'src/next/generation-v2/providers/deepseek/chatStreamV1.ts',
      'src/next/generation-v2/runner/generationRequestTerminalV2.ts',
      'src/next/generation-v2/credential/credentialScopeV2.ts',
      'src/next/generation-v2/contracts/anthropicDeveloperApiContractV2.ts',
      'src/next/generation-v2/contracts/geminiDeveloperApiContractV2.ts',
      'src/next/generation-v2/contracts/deepSeekStableApiContractV2.ts',
      'src/next/generation-v2/contracts/deepSeekBetaApiContractV2.ts',
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
    const nonExecutableSelection = path.resolve(
      'src/next/generation-v2/providers/openrouter-images/selectionDecisionV2.ts',
    )
    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === recordModule || file === nonExecutableSelection) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/DecodedProviderBindingRecordV2|decodeProviderBindingRecordV2/u)
    }
  })

  it('does not allow repository-decoded descriptor facts to become compiler or snapshot authority', () => {
    const factModule = path.resolve('src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2.ts')
    const nonExecutableSelection = path.resolve(
      'src/next/generation-v2/providers/openrouter-images/selectionDecisionV2.ts',
    )
    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === factModule || file === nonExecutableSelection) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/DecodedOpenRouterImageDescriptorCacheRecordV2|decodeOpenRouterImageDescriptorCacheRecordV2/u)
    }
  })

  it('keeps endpoint selection decisions non-executable and outside snapshot or transport authority', () => {
    const source = read('src/next/generation-v2/providers/openrouter-images/selectionDecisionV2.ts')
    expect(source).toContain("trust: 'selection_decision_non_executable'")
    expect(source).not.toMatch(/PreparedRequest|ResolvedProviderBinding|executionAuthority|fetch\(|net\.request|compareAndSetBinding/iu)
  })

  it('keeps LM Studio native continuation codecs isolated from legacy and cloud provider paths', () => {
    for (const file of [
      'src/next/generation-v2/providers/lmstudio-openresponses/nativeItemsV1.ts',
      'src/next/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1.ts',
    ]) {
      expect(read(file), file).not.toMatch(/lmStudioTextChat|lmStudioLocalProviderIpc|providerNativeSnapshot|openai-responses\/openai|ipcMain|fetch\(|net\.request/iu)
    }
  })

  it('keeps request terminal transition logic below operation, persistence and wire layers', () => {
    const source = read('src/next/generation-v2/runner/generationRequestTerminalV2.ts')
    expect(source).not.toMatch(/assistant_answer_generation|answerGeneration|orphanStreamingRecovery|TerminalArbiter|streamSemanticCore|branch|chosen|head|hide|ipcMain|fetch\(|net\.request/iu)
    expect(source).not.toMatch(/infra\/db|electron\/|providers\//iu)
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

  it('keeps Gemini v1beta surface identity centralized and zero-activation', () => {
    const contractModule = path.resolve(
      'src/next/generation-v2/contracts/geminiDeveloperApiContractV2.ts',
    )
    const registryModule = path.resolve('src/next/generation-v2/contracts/providerContractRegistryV2.ts')
    const contract = read('src/next/generation-v2/contracts/geminiDeveloperApiContractV2.ts')
    expect(contract).toContain("apiVersion: 'v1beta'")
    expect(contract).toContain("executionAuthority: 'none'")
    expect(contract).not.toMatch(/apiVersion:\s*'v1'|versionFallback|fallbackVersion|probeVersion/iu)
    expect(contract).not.toMatch(/gemini_agents_v1beta|fetch\(|net\.request|ipcMain/iu)

    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === contractModule || file === registryModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/generativelanguage\.googleapis\.com|\/v1beta\/(?:models|interactions)|gemini_(?:generate_content|interactions)_v1beta/iu)
    }
    for (const file of productionSources(path.resolve('electron'))) {
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/geminiDeveloperApiContractV2|generation-v2\/contracts\/gemini/iu)
    }
  })

  it('keeps Anthropic direct-API surface identity centralized and zero-activation', () => {
    const contractModule = path.resolve(
      'src/next/generation-v2/contracts/anthropicDeveloperApiContractV2.ts',
    )
    const registryModule = path.resolve('src/next/generation-v2/contracts/providerContractRegistryV2.ts')
    const contract = read('src/next/generation-v2/contracts/anthropicDeveloperApiContractV2.ts')
    expect(contract).toContain("executionAuthority: 'none'")
    expect(contract).toContain("value: '2023-06-01'")
    expect(contract).toContain("value: 'files-api-2025-04-14'")
    expect(contract).not.toMatch(/fetch\(|net\.request|ipcMain|thinking\.display|model.*regex|fallback/iu)

    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === contractModule || file === registryModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/api\.anthropic\.com|anthropic-version|files-api-2025-04-14|anthropic_messages_2023_06_01/iu)
    }
    for (const file of productionSources(path.resolve('electron'))) {
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/anthropicDeveloperApiContractV2|generation-v2\/contracts\/anthropic/iu)
    }
  })

  it('keeps DeepSeek stable identity centralized, native-history complete and zero-activation', () => {
    const contractModule = path.resolve(
      'src/next/generation-v2/contracts/deepSeekStableApiContractV2.ts',
    )
    const betaContractModule = path.resolve(
      'src/next/generation-v2/contracts/deepSeekBetaApiContractV2.ts',
    )
    const registryModule = path.resolve('src/next/generation-v2/contracts/providerContractRegistryV2.ts')
    const contract = read('src/next/generation-v2/contracts/deepSeekStableApiContractV2.ts')
    expect(contract).toContain("apiOrigin: 'https://api.deepseek.com'")
    expect(contract).toContain("relativePathTemplate: '/chat/completions'")
    expect(contract).toContain("relativePathTemplate: '/models'")
    expect(contract).toContain("executionAuthority: 'none'")
    expect(contract).not.toMatch(/api\.deepseek\.com\/v1|api\.deepseek\.com\/beta|probe|automaticFallback|fetch\(|net\.request|ipcMain/iu)

    for (const file of productionSources(path.resolve('src/next/generation-v2'))) {
      if (file === contractModule || file === betaContractModule || file === registryModule) continue
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/api\.deepseek\.com|deepseek_stable_chat_v1/iu)
    }
    for (const file of productionSources(path.resolve('electron'))) {
      expect(readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
        .not.toMatch(/deepSeekStableApiContractV2|generation-v2\/providers\/deepseek/iu)
    }

    const request = read('src/next/generation-v2/providers/deepseek/chatRequestV1.ts')
    const native = read('src/next/generation-v2/providers/deepseek/nativeMessagesV1.ts')
    const beta = read('src/next/generation-v2/contracts/deepSeekBetaApiContractV2.ts')
    expect(beta).toContain("apiOrigin: 'https://api.deepseek.com/beta'")
    expect(beta).toContain('explicitSelectionRequired: true')
    expect(beta).toContain("runtimeFallback: 'forbidden'")
    expect(beta).not.toMatch(/readDeepSeekStableApiContract|deepseek-stable-chat|fetch\(|net\.request|ipcMain/iu)
    expect(request).toContain("'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED'")
    expect(request).not.toMatch(/applyProviderGenerationParamsPatch|extraBody|wirePath|fetch\(|runtimeProviderAdapter/iu)
    expect(native).toContain('reasoning_content')
    expect(native).not.toMatch(/reasoningDisplay|DeepSeekTextChat|deepSeekAdapter|ipcMain/iu)
  })
})
