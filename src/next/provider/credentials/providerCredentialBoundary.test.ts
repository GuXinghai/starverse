import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID } from '@/next/provider/generic/genericEndpointDescriptor'
import {
  resolveGenericEndpointDescriptor,
  toSafeGenericEndpointMetadata,
  type GenericEndpointConfig,
} from '@/next/provider/generic/genericEndpointConfig'
import {
  validateProviderCredentialRef,
  providerCredentialResolutionFromCredential,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'
import {
  SECRET_LIKE_CREDENTIAL_FIELD_NAMES,
  createBearerCredential,
  isSecretLikeCredentialFieldName,
  normalizeCredentialFieldName,
} from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolverFromStore,
  providerCredentialStoreError,
  providerCredentialStoreInvalid,
  providerCredentialStoreMissing,
  providerCredentialStoreUnavailable,
  type ProviderCredentialStore,
} from '@/next/provider/credentials/providerCredentialStore'

const repoRoot = process.cwd()

const boundarySourceFiles = [
  ...collectSourceFiles(join(repoRoot, 'src', 'next', 'provider', 'credentials')),
  join(repoRoot, 'src', 'next', 'provider', 'generic', 'genericEndpointConfig.ts'),
]

const forbiddenRuntimeImportPattern =
  /^(?!\s*import\s+type\b)\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]*(?:electron|electron-store|preload|storeIpc|src\/ui-app|@\/ui-app|openRouterLiveStream|useChatSession|appChatApp\.logic|SettingsPanel|openRouterStreamBridge)[^'"]*['"]/m

const forbiddenCodeReferences: ReadonlyArray<Readonly<{ label: string; pattern: RegExp }>> = [
  { label: 'ipcRenderer/ipcMain', pattern: /\bipc(?:Renderer|Main)\b/ },
  { label: 'renderer globals', pattern: /\b(?:window|document|localStorage|sessionStorage)\b/ },
  { label: 'process.env', pattern: /\bprocess\s*\.\s*env\b/ },
  { label: 'electron-store', pattern: /\belectron-store\b/ },
  { label: 'storeIpc', pattern: /\bstoreIpc\b/ },
  { label: 'settings UI', pattern: /\bSettingsPanel\b/ },
  { label: 'OpenRouter renderer/session modules', pattern: /\b(?:useChatSession|appChatApp\.logic|openRouterLiveStream|openRouterStreamBridge)\b/ },
]

const secretLikeFields = [
  'apiKey',
  'APIKey',
  'api_key',
  'token',
  'accessToken',
  'bearerToken',
  'Authorization',
  'authorization',
  'headers',
  'customHeaders',
  'authHeaders',
  'password',
  'secret',
  'privateKey',
  'proxyAuthorization',
] as const

const secretValues = [
  'sk-boundary-secret-token',
  'Bearer sk-boundary-secret-token',
  'Authorization',
  'authorization',
  'headers',
  'userinfo',
] as const

const credentialRef = { kind: 'credential_ref' as const, id: 'generic-boundary-ref' }

function collectSourceFiles(root: string): string[] {
  const files: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!/\.ts$/i.test(entry)) continue
      if (/\.test\.ts$/i.test(entry)) continue
      files.push(fullPath)
    }
  }

  return files
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function relativePath(file: string): string {
  return relative(repoRoot, file).split('\\').join('/')
}

function validConfig(overrides?: Partial<GenericEndpointConfig>): GenericEndpointConfig {
  return {
    endpointId: 'ep-boundary',
    displayName: 'Boundary Endpoint',
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o-mini',
    credentialRef,
    ...overrides,
  }
}

function validResolver(): ProviderCredentialResolver {
  return () => providerCredentialResolutionFromCredential(createBearerCredential('sk-resolved-secret-token'))
}

function expectNoSecretShapes(serialized: string): void {
  for (const value of secretValues) {
    expect(serialized).not.toContain(value)
  }
}

describe('provider credential boundary safety gates', () => {
  describe('static import boundary gate', () => {
    it('keeps credential and Generic config boundary sources free of Electron, renderer, env, store, and OpenRouter legacy imports', () => {
      const offenders: string[] = []

      for (const file of boundarySourceFiles) {
        const source = readFileSync(file, 'utf8')
        if (forbiddenRuntimeImportPattern.test(source)) {
          offenders.push(`${relativePath(file)}: forbidden runtime import`)
        }

        const uncommentedSource = stripComments(source)
        for (const { label, pattern } of forbiddenCodeReferences) {
          if (pattern.test(uncommentedSource)) {
            offenders.push(`${relativePath(file)}: forbidden ${label} reference`)
          }
        }
      }

      expect(offenders).toEqual([])
    })
  })

  describe('secret-shape boundary gate', () => {
    it('credential secret-like field helper is the shared case-insensitive SSOT', () => {
      expect(SECRET_LIKE_CREDENTIAL_FIELD_NAMES).toContain('authorization')
      expect(SECRET_LIKE_CREDENTIAL_FIELD_NAMES).toContain('customheaders')
      expect(SECRET_LIKE_CREDENTIAL_FIELD_NAMES).toContain('proxy_authorization')
      expect(normalizeCredentialFieldName('APIKey')).toBe('apikey')
      expect(isSecretLikeCredentialFieldName('APIKey')).toBe(true)
      expect(isSecretLikeCredentialFieldName('Authorization')).toBe(true)
      expect(isSecretLikeCredentialFieldName('customHeaders')).toBe(true)
      expect(isSecretLikeCredentialFieldName('safeDisplayName')).toBe(false)
    })

    it('ProviderCredentialRef rejects common secret-like fields case-insensitively with safe errors', () => {
      for (const field of secretLikeFields) {
        const result = validateProviderCredentialRef({
          kind: 'credential_ref',
          id: 'generic-boundary-ref',
          [field]: field.toLowerCase().includes('authorization')
            ? 'Bearer sk-boundary-secret-token'
            : 'sk-boundary-secret-token',
        })

        expect('code' in result).toBe(true)
        if ('code' in result) {
          expect(result.code).toBe('invalid_credential_ref')
          expect(result.message).toBe('Credential reference must not contain secret-like fields.')
          expectNoSecretShapes(JSON.stringify(result))
        }
      }
    })

    it('GenericEndpointConfig rejects common secret-like fields case-insensitively with safe errors', () => {
      for (const field of secretLikeFields) {
        const result = resolveGenericEndpointDescriptor(
          {
            ...validConfig(),
            [field]: field.toLowerCase().includes('authorization')
              ? 'Bearer sk-boundary-secret-token'
              : 'sk-boundary-secret-token',
          } as GenericEndpointConfig,
          validResolver(),
        )

        expect('code' in result).toBe(true)
        if ('code' in result) {
          expect(result.code).toBe('secret_like_field_rejected')
          expect(result.message).toBe('Config must not contain secret-like field. Use credentialRef instead.')
          expectNoSecretShapes(JSON.stringify(result))
        }
      }
    })

    it('safe Generic metadata never exposes raw credential, auth headers, or URL userinfo', () => {
      const metadata = toSafeGenericEndpointMetadata(
        validConfig({
          baseUrl: 'https://user:sk-boundary-secret-token@api.example.com/v1',
        }),
      )
      const serialized = JSON.stringify(metadata)

      expect(metadata.credentialPresent).toBe(true)
      expectNoSecretShapes(serialized)
      expect(serialized).not.toContain('user:')
      expect(serialized).not.toContain('api.example.com')
    })

    it('store failure results exposed to the resolver are normalized before leaving the boundary', () => {
      const stores: ProviderCredentialStore[] = [
        { getCredential: () => providerCredentialStoreMissing() },
        { getCredential: () => providerCredentialStoreInvalid() },
        { getCredential: () => providerCredentialStoreUnavailable() },
        { getCredential: () => providerCredentialStoreError() },
        {
          getCredential: () => ({
            ok: false,
            code: 'store_error',
            message: 'Authorization: Bearer sk-boundary-secret-token headers userinfo',
          }),
        },
      ]

      for (const store of stores) {
        const result = providerCredentialResolverFromStore(store)(credentialRef)
        const serialized = JSON.stringify(result)

        expect(result.ok).toBe(false)
        expectNoSecretShapes(serialized)
      }
    })
  })
})
