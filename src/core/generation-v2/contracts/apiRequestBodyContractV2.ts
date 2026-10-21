import {
  listReviewedProviderContractDefinitionsV2,
  type ProviderContractOperationV2,
} from './providerContractRegistryV2'
import {
  validateApiRequestBodySchemaV2,
  apiRequestBodySchemaDigestV2,
  ApiRequestBodySchemaV2Error,
  type ApiRequestBodySchemaNodeV2,
} from './apiRequestBodySchemaV2'
import { OPENROUTER_CHAT_REQUEST_BODY_SCHEMA_V2, DEEPSEEK_CHAT_REQUEST_BODY_SCHEMA_V2,
  GENERIC_LOCAL_CHAT_REQUEST_BODY_SCHEMA_V2, OPENAI_COMPATIBLE_CHAT_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/chatCompletionsRequestBodySchemaV2'
import { OPENAI_RESPONSES_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/openAIResponsesRequestBodySchemaV2'
import { OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/openAIResponsesLegacyRequestBodySchemaV2'
import { ANTHROPIC_MESSAGES_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/anthropicMessagesRequestBodySchemaV2'
import { ANTHROPIC_MESSAGES_LEGACY_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/anthropicMessagesLegacyRequestBodySchemaV2'
import { GEMINI_GENERATE_CONTENT_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/geminiGenerateContentRequestBodySchemaV2'
import { GEMINI_INTERACTIONS_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/geminiInteractionsRequestBodySchemaV2'
import { OPENROUTER_IMAGE_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/openRouterImageRequestBodySchemaV2'
import { OLLAMA_CHAT_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/ollamaChatRequestBodySchemaV2'
import { LMSTUDIO_OPENRESPONSES_REQUEST_BODY_SCHEMA_V2 } from './body-schemas/lmStudioOpenResponsesRequestBodySchemaV2'
import { validateCompatibleChatRequestBodyV2 } from '../../../shared/provider/openai-chat-compatible/request/compatibleChatRequestBodySchemaV2'
import { generationRequestBodyMaxBytesForContractV1 } from '../capacity/generationCapacityV1'

export type ApiRequestBodyContractV2 = Readonly<{
  schemaVersion: 1
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
  bodySchemaRevision: string
  maxBodyBytes: number
  schema: ApiRequestBodySchemaNodeV2
  validateBody(value: unknown): unknown
}>

export class ApiRequestBodyContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN'
    | 'GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID') {
    super(code)
    this.name = 'ApiRequestBodyContractV2Error'
  }
}

type BodySchemaProjectionV2 = Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
  maxBodyBytes: number
  validatorRevision: string
  schema: ApiRequestBodySchemaNodeV2
}>

const schemaByProtocol: Readonly<Record<string, Readonly<{ schema: ApiRequestBodySchemaNodeV2; maxBodyBytes: number }>>> = Object.freeze({
  'openrouter-images-v1': Object.freeze({ schema: OPENROUTER_IMAGE_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('openrouter-images-v1') }),
  'openrouter-chat-completions-v1': Object.freeze({ schema: OPENROUTER_CHAT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('openrouter-chat-completions-v1') }),
  'gemini-generate-content-v1beta': Object.freeze({ schema: GEMINI_GENERATE_CONTENT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('gemini-generate-content-v1beta') }),
  'gemini-interactions-v1beta': Object.freeze({ schema: GEMINI_INTERACTIONS_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('gemini-interactions-v1beta') }),
  'anthropic-messages-2023-06-01': Object.freeze({ schema: ANTHROPIC_MESSAGES_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('anthropic-messages-2023-06-01') }),
  'deepseek-stable-chat-v1': Object.freeze({ schema: DEEPSEEK_CHAT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('deepseek-stable-chat-v1') }),
  'openai-responses-v1': Object.freeze({ schema: OPENAI_RESPONSES_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('openai-responses-v1') }),
  'generic-local-openai-chat-completions': Object.freeze({ schema: GENERIC_LOCAL_CHAT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('generic-local-openai-chat-completions') }),
  'ollama-chat-v1': Object.freeze({ schema: OLLAMA_CHAT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('ollama-chat-v1') }),
  'lmstudio-openresponses': Object.freeze({ schema: LMSTUDIO_OPENRESPONSES_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('lmstudio-openresponses') }),
  'openai_chat_compatible': Object.freeze({ schema: OPENAI_COMPATIBLE_CHAT_REQUEST_BODY_SCHEMA_V2, maxBodyBytes: generationRequestBodyMaxBytesForContractV1('openai_chat_compatible') }),
})

const currentDefinitions = listReviewedProviderContractDefinitionsV2()
const contracts = new Map<string, ApiRequestBodyContractV2>()
const contractsByRevision = new Map<string, ApiRequestBodyContractV2>()
const legacyLmStudioOpenResponsesBodySchemaRevisions = new Set<string>()
const legacyAnthropicMessagesBodySchemaRevisions = new Set<string>()
for (const definition of currentDefinitions) {
  const entry = schemaByProtocol[definition.protocolContractId.value]
  if (!entry) throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
  for (const operation of definition.operations) {
    const projection: BodySchemaProjectionV2 = Object.freeze({
      providerId: definition.providerId.value,
      protocolContractId: definition.protocolContractId.value,
      operation,
      maxBodyBytes: entry.maxBodyBytes,
      validatorRevision: definition.protocolContractId.value === 'openai_chat_compatible'
        ? 'api-request-body-validator-v2+compatible-wire-shape-v2'
        : definition.protocolContractId.value === 'lmstudio-openresponses'
          ? 'api-request-body-validator-v2+lmstudio-tool-strict-boolean-v1'
          : 'api-request-body-validator-v2',
      schema: entry.schema,
    })
    const bodySchemaRevision = `api-body-v1:${definition.protocolContractId.value}:${apiRequestBodySchemaDigestV2(projection)}`
    const contract: ApiRequestBodyContractV2 = Object.freeze({
      schemaVersion: 1,
      providerId: definition.providerId.value,
      protocolContractId: definition.protocolContractId.value,
      operation,
      bodySchemaRevision,
      maxBodyBytes: entry.maxBodyBytes,
      schema: entry.schema,
      validateBody(value: unknown): unknown {
        try {
          const validated = validateApiRequestBodySchemaV2(value, entry.schema, entry.maxBodyBytes)
          return definition.protocolContractId.value === 'openai_chat_compatible'
            ? validateCompatibleChatRequestBodyV2(validated)
            : validated
        } catch (error) {
          if (error instanceof ApiRequestBodySchemaV2Error) {
            throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
          }
          throw error
        }
      },
    })
    const key = `${definition.providerId.value}\0${operation}`
    if (contracts.has(key) || contractsByRevision.has(bodySchemaRevision)) {
      throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
    }
    contracts.set(key, contract)
    contractsByRevision.set(bodySchemaRevision, contract)
    if (definition.protocolContractId.value === 'openai-responses-v1') {
      const legacyProjection = Object.freeze({ ...projection, schema: OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2 })
      const legacyBodySchemaRevision = `api-body-v1:${definition.protocolContractId.value}:${apiRequestBodySchemaDigestV2(legacyProjection)}`
      contractsByRevision.set(legacyBodySchemaRevision, Object.freeze({ ...contract,
        bodySchemaRevision: legacyBodySchemaRevision, schema: OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2,
        validateBody(value: unknown): unknown {
          try { return validateApiRequestBodySchemaV2(value, OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2, entry.maxBodyBytes) }
          catch (error) {
            if (error instanceof ApiRequestBodySchemaV2Error) throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
            throw error
          }
        },
      }))
    }
    if (definition.protocolContractId.value === 'lmstudio-openresponses') {
      const legacyProjection: BodySchemaProjectionV2 = Object.freeze({ ...projection,
        validatorRevision: 'api-request-body-validator-v2' })
      const legacyBodySchemaRevision = `api-body-v1:${definition.protocolContractId.value}:${apiRequestBodySchemaDigestV2(legacyProjection)}`
      if (contractsByRevision.has(legacyBodySchemaRevision)) {
        throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
      }
      contractsByRevision.set(legacyBodySchemaRevision, Object.freeze({ ...contract, bodySchemaRevision: legacyBodySchemaRevision }))
      legacyLmStudioOpenResponsesBodySchemaRevisions.add(legacyBodySchemaRevision)
    }
    if (definition.protocolContractId.value === 'anthropic-messages-2023-06-01') {
      const legacyProjection: BodySchemaProjectionV2 = Object.freeze({ ...projection,
        schema: ANTHROPIC_MESSAGES_LEGACY_REQUEST_BODY_SCHEMA_V2 })
      const legacyBodySchemaRevision = `api-body-v1:${definition.protocolContractId.value}:${apiRequestBodySchemaDigestV2(legacyProjection)}`
      if (contractsByRevision.has(legacyBodySchemaRevision)) {
        throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
      }
      const legacyContract: ApiRequestBodyContractV2 = Object.freeze({
        schemaVersion: 1,
        providerId: definition.providerId.value,
        protocolContractId: definition.protocolContractId.value,
        operation,
        bodySchemaRevision: legacyBodySchemaRevision,
        maxBodyBytes: entry.maxBodyBytes,
        schema: ANTHROPIC_MESSAGES_LEGACY_REQUEST_BODY_SCHEMA_V2,
        validateBody(value: unknown): unknown {
          try {
            return validateApiRequestBodySchemaV2(value, ANTHROPIC_MESSAGES_LEGACY_REQUEST_BODY_SCHEMA_V2, entry.maxBodyBytes)
          } catch (error) {
            if (error instanceof ApiRequestBodySchemaV2Error) {
              throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_INVALID')
            }
            throw error
          }
        },
      })
      contractsByRevision.set(legacyBodySchemaRevision, legacyContract)
      legacyAnthropicMessagesBodySchemaRevisions.add(legacyBodySchemaRevision)
    }
  }
}

/** The default is the active body schema; a supplied revision pins historical dispatch. */
export function readApiRequestBodyContractV2(
  providerId: string,
  operation: ProviderContractOperationV2,
  bodySchemaRevision?: string,
): ApiRequestBodyContractV2 {
  if (typeof providerId !== 'string' || typeof operation !== 'string') {
    throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN')
  }
  const contract = bodySchemaRevision === undefined
    ? contracts.get(`${providerId}\0${operation}`)
    : contractsByRevision.get(bodySchemaRevision)
  if (!contract || contract.providerId !== providerId || contract.operation !== operation) {
    throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN')
  }
  return contract
}

export function listApiRequestBodyContractsV2(): readonly ApiRequestBodyContractV2[] {
  return Object.freeze([...contracts.values()])
}

export function readLegacyOpenAIResponsesBodyRequestContractV2(operation: ProviderContractOperationV2): ApiRequestBodyContractV2 {
  const contract = [...contractsByRevision.values()].find((item) => item.providerId === 'openai_responses' && item.operation === operation && item.schema === OPENAI_RESPONSES_LEGACY_REQUEST_BODY_SCHEMA_V2)
  if (!contract) throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN')
  return contract
}

/** Missing body references and the pre-tool-definition revisions keep the historical strict-true codec. */
export function isLegacyLmStudioOpenResponsesBodySchemaRevisionV2(bodySchemaRevision?: string): boolean {
  return bodySchemaRevision === undefined || legacyLmStudioOpenResponsesBodySchemaRevisions.has(bodySchemaRevision)
}

export function readLegacyLmStudioOpenResponsesBodyRequestContractV2(
  operation: ProviderContractOperationV2,
): ApiRequestBodyContractV2 {
  for (const revision of legacyLmStudioOpenResponsesBodySchemaRevisions) {
    const contract = contractsByRevision.get(revision)
    if (contract?.providerId === 'lmstudio' && contract.operation === operation) return contract
  }
  throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN')
}

/** Resolves the body schema revision used before enabled Anthropic thinking required its token budget. */
export function readLegacyAnthropicMessagesBodyRequestContractV2(
  operation: ProviderContractOperationV2,
): ApiRequestBodyContractV2 {
  for (const revision of legacyAnthropicMessagesBodySchemaRevisions) {
    const contract = contractsByRevision.get(revision)
    if (contract?.providerId === 'anthropic' && contract.operation === operation) return contract
  }
  throw new ApiRequestBodyContractV2Error('GENERATION_V2_API_REQUEST_BODY_CONTRACT_UNKNOWN')
}

export function validateApiRequestBodyV2(
  providerId: string,
  operation: ProviderContractOperationV2,
  value: unknown,
  expectedBodySchemaRevision?: string,
): unknown {
  if (expectedBodySchemaRevision === undefined) return value
  const contract = readApiRequestBodyContractV2(providerId, operation, expectedBodySchemaRevision)
  return contract.validateBody(value)
}
