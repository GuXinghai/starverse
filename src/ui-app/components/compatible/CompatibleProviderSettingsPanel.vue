<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { createCompatibleProviderRegistryClient } from "@/next/provider/openai-chat-compatible/ui";
import { createCompatibleCatalogClient } from "@/next/modelCatalog/compatibleCatalogClient";
import UiIcon from "@/ui-kit/icons/UiIcon.vue";
import { t } from "@/shared/i18n";

const props = defineProps<{ disabled: boolean }>();
const registry = createCompatibleProviderRegistryClient();
const catalog = createCompatibleCatalogClient();
const providers = ref<CompatibleProviderRegistryDetails[]>([]);
const selectedId = ref("");
const displayName = ref("");
const baseUrl = ref("https://api.example.com");
const securityPolicy = ref<"compatibility_first" | "strict_ssrf">(
  "compatibility_first",
);
const authMode = ref<"none" | "bearer" | "basic" | "custom_headers">("bearer");
const secret = ref("");
const username = ref("");
const organization = ref("");
const project = ref("");
const ordinaryHeaders = ref("");
const query = ref("");
const customSecretHeaders = ref("");
const manualModelId = ref("");
const manualDisplayName = ref("");
const manualContextLength = ref("");
const manualMaxOutputTokens = ref("");
const manualTextCapability = ref<"unknown" | "yes" | "no">("unknown");
const manualVisionCapability = ref<"unknown" | "yes" | "no">("unknown");
const manualToolsCapability = ref<"unknown" | "yes" | "no">("unknown");
const manualStructuredCapability = ref<"unknown" | "yes" | "no">("unknown");
const manualReasoningCapability = ref<"unknown" | "yes" | "no">("unknown");
const manualPromptPrice = ref("");
const manualCompletionPrice = ref("");
const manualRequestPrice = ref("");
const manualImagePrice = ref("");
const models = ref<CompatibleCatalogMergedModel[]>([]);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const diagnostics = ref<CompatibleConnectionTestResult | null>(null);
const requestProfileJson = ref("");
const extraBodyJson = ref("{}");
const requestMappingsJson = ref("[]");
const requestReasoningPreset = ref<"disabled" | "openai_reasoning_effort" | "chat_template_enable_thinking" | "custom">("custom");
const reasoningMappingJson = ref("");
const reasoningMode = ref<"custom_preferred_with_builtin_fallback" | "custom_only">("custom_preferred_with_builtin_fallback");
const inlinePolicyJson = ref("");
const discovery = ref<CompatibleDiscoveredResponseField[]>([]);
const credentialStorageFallback = ref(false);
const plaintextPersistenceSupported = computed(() => window.electronAPI?.platform === "linux");

const selected = computed(
  () =>
    providers.value.find(
      (item) => item.provider.providerInstanceId === selectedId.value,
    ) ?? null,
);

function publicValues(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      if (index < 1) throw new Error("invalid_name_value_line");
      return {
        name: line.slice(0, index).trim(),
        value: line.slice(index + 1).trim(),
        classification: "public_non_secret" as const,
      };
    });
}

function credential() {
  if (authMode.value === "none") return { mode: "none" as const };
  if (authMode.value === "bearer")
    return { mode: "bearer" as const, token: secret.value };
  if (authMode.value === "basic")
    return {
      mode: "basic" as const,
      username: username.value,
      password: secret.value,
    };
  return {
    mode: "custom_headers" as const,
    headers: publicValues(customSecretHeaders.value).map(({ name, value }) => ({
      name,
      value,
    })),
  };
}

function clearSecrets() {
  secret.value = "";
  username.value = "";
  customSecretHeaders.value = "";
}

async function load() {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    providers.value = [...(await registry.list())];
    if (
      selectedId.value &&
      !providers.value.some(
        (item) => item.provider.providerInstanceId === selectedId.value,
      )
    )
      selectedId.value = "";
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "compatible_registry_unavailable";
  } finally {
    busy.value = false;
  }
}

function choose(details: CompatibleProviderRegistryDetails) {
  selectedId.value = details.provider.providerInstanceId;
  displayName.value = details.provider.displayName;
  const endpoint = details.endpointRevisions[0];
  if (endpoint) {
    baseUrl.value = endpoint.baseUrl;
    securityPolicy.value = endpoint.securityPolicy;
    authMode.value = endpoint.authMode;
    organization.value =
      endpoint.ordinaryHeaders.find(
        (entry) => entry.name.toLowerCase() === "openai-organization",
      )?.value ?? "";
    project.value =
      endpoint.ordinaryHeaders.find(
        (entry) => entry.name.toLowerCase() === "openai-project",
      )?.value ?? "";
    ordinaryHeaders.value = endpoint.ordinaryHeaders
      .filter(
        (entry) =>
          !["openai-organization", "openai-project"].includes(
            entry.name.toLowerCase(),
          ),
      )
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("\n");
    query.value = endpoint.query
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("\n");
  }
  const active = details.activeConfiguration as any;
  requestProfileJson.value = active?.requestBundle?.profile?.config
    ? JSON.stringify(active.requestBundle.profile.config, null, 2)
    : "";
  extraBodyJson.value = JSON.stringify(active?.requestBundle?.profile?.config?.defaultExtraBody ?? {}, null, 2);
  requestMappingsJson.value = JSON.stringify(
    (active?.requestBundle?.mappings ?? []).map((mapping: any) => {
      const {
        schemaVersion: _schemaVersion,
        mappingId: _mappingId,
        requestProfileId: _requestProfileId,
        requestProfileVersion: _requestProfileVersion,
        ...editable
      } = mapping.config ?? {};
      return editable;
    }),
    null,
    2,
  );
  reasoningMappingJson.value = active?.reasoningMapping?.config
    ? JSON.stringify(active.reasoningMapping.config, null, 2)
    : "";
  reasoningMode.value = active?.reasoningMapping?.config?.mode === "custom_only" ? "custom_only" : "custom_preferred_with_builtin_fallback";
  inlinePolicyJson.value = active?.inlinePolicy?.config
    ? JSON.stringify(active.inlinePolicy.config, null, 2)
    : "";
  clearSecrets();
  diagnostics.value = null;
  void loadModels();
  void loadDiscovery();
}

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function beginCreate() {
  selectedId.value = "";
  displayName.value = "";
  baseUrl.value = "https://api.example.com";
  securityPolicy.value = "compatibility_first";
  authMode.value = "bearer";
  organization.value = "";
  project.value = "";
  ordinaryHeaders.value = "";
  query.value = "";
  models.value = [];
  discovery.value = [];
  clearSecrets();
}

function needsCredentialStorageChoice(cause: unknown) {
  return cause instanceof Error && (
    cause.message === "GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED" ||
    cause.message === "GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE"
  );
}

async function save(storageMode?: "session" | "plaintext") {
  busy.value = true;
  error.value = "";
  notice.value = "";
  // R4-09 (P6a-05): what the request needs is read here, before the first await, so a change made while the
  // save is in flight cannot alter what is sent for the provider that was being saved.
  const savingProviderId = selected.value?.provider.providerInstanceId ?? null;
  const savingDisplayName = displayName.value;
  const savingAuthMode = authMode.value;
  const hasNewSecret = Boolean(secret.value || customSecretHeaders.value);
  try {
    if (savingProviderId !== null && savingAuthMode === "basic" && username.value && !secret.value) {
      // A username cannot be stored without its password; saying so beats silently dropping the edit.
      throw new Error("compatible_basic_password_required");
    }
    const savingCredential = credential();
    const explicitHeaders = [
      ...(organization.value.trim()
        ? [
            {
              name: "OpenAI-Organization",
              value: organization.value.trim(),
              classification: "public_non_secret" as const,
            },
          ]
        : []),
      ...(project.value.trim()
        ? [
            {
              name: "OpenAI-Project",
              value: project.value.trim(),
              classification: "public_non_secret" as const,
            },
          ]
        : []),
    ];
    const endpoint = {
      baseUrl: baseUrl.value,
      securityPolicy: securityPolicy.value,
      ordinaryHeaders: [
        ...explicitHeaders,
        ...publicValues(ordinaryHeaders.value),
      ],
      query: publicValues(query.value),
    };
    let details: CompatibleProviderRegistryDetails;
    if (savingProviderId === null)
      details = await registry.create({
        displayName: savingDisplayName,
        endpoint,
        credential: savingCredential,
        ...(storageMode === undefined ? {} : { storageMode }),
        requestMappings: [],
      });
    else {
      details = await registry.update({
        providerInstanceId: savingProviderId,
        displayName: savingDisplayName,
      });
      details = await registry.updateEndpoint({
        providerInstanceId: details.provider.providerInstanceId,
        endpoint,
        credential: savingAuthMode === "none"
          ? { mode: "none" as const }
          : hasNewSecret
            ? savingCredential
            : null,
        ...(storageMode === undefined ? {} : { storageMode }),
      });
    }
    clearSecrets();
    credentialStorageFallback.value = false;
    selectedId.value = details.provider.providerInstanceId;
    await load();
    choose(details);
    notice.value = t("settings.openAICompatible.saved");
  } catch (cause) {
    credentialStorageFallback.value = needsCredentialStorageChoice(cause) &&
      savingAuthMode !== "none" && hasNewSecret;
    error.value =
      cause instanceof Error ? cause.message : "invalid_configuration";
  } finally {
    busy.value = false;
  }
}

async function removeProvider() {
  if (
    !selected.value ||
    !window.confirm(t("settings.openAICompatible.deleteConfirm"))
  )
    return;
  busy.value = true;
  try {
    await registry.deleteProvider(selected.value.provider.providerInstanceId);
    beginCreate();
    await load();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "registry_unavailable";
  } finally {
    busy.value = false;
  }
}

async function removeCredential(credentialVersionRef: string) {
  if (!selected.value || !window.confirm(t("settings.openAICompatible.deleteCredentialConfirm"))) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  error.value = "";
  try {
    const details = await registry.deleteCredential(credentialVersionRef);
    providers.value = providers.value.map((item) => item.provider.providerInstanceId === details.provider.providerInstanceId ? details : item);
    if (selectedId.value === providerId) choose(details);
  } catch (cause) {
    error.value = errorText(cause, "registry_unavailable");
  } finally {
    busy.value = false;
  }
}

async function testConnection() {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  diagnostics.value = null;
  error.value = "";
  try {
    const result = await registry.testConnection(providerId, crypto.randomUUID()) as CompatibleConnectionTestResult;
    if (selectedId.value === providerId) diagnostics.value = result;
  } catch (cause) {
    error.value = errorText(cause, "compatible_connection_test_failed");
  } finally {
    busy.value = false;
  }
}

async function saveProfiles(acceptedDiscoveryPaths: readonly string[] = []) {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const requestProfile = JSON.parse(requestProfileJson.value);
    const defaultExtraBody = JSON.parse(extraBodyJson.value);
    const details = await registry.reviseConfiguration({
      providerInstanceId: providerId,
      requestProfile: { ...requestProfile, defaultExtraBody },
      requestMappings: JSON.parse(requestMappingsJson.value),
      reasoningMapping: { ...JSON.parse(reasoningMappingJson.value), mode: reasoningMode.value },
      inlinePolicy: JSON.parse(inlinePolicyJson.value),
      acceptedDiscoveryPaths,
    });
    providers.value = providers.value.map((item) =>
      item.provider.providerInstanceId === details.provider.providerInstanceId
        ? details
        : item,
    );
    if (selectedId.value === providerId) choose(details);
    notice.value = t("settings.openAICompatible.profilesSaved");
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "invalid_configuration";
  } finally {
    busy.value = false;
  }
}

function applyRequestReasoningPreset() {
  if (requestReasoningPreset.value === "custom") return;
  const mappings = requestReasoningPreset.value === "disabled" ? []
    : requestReasoningPreset.value === "openai_reasoning_effort"
      ? [{ sourceField: "reasoning_effort", targetPath: ["reasoning_effort"], omission: "omit_when_unset" }]
      : [{ sourceField: "reasoning_enabled", targetPath: ["chat_template_kwargs", "enable_thinking"], omission: "omit_when_unset" }];
  requestMappingsJson.value = JSON.stringify(mappings, null, 2);
}

function orderedReasoningRules(): any[] {
  try { return JSON.parse(reasoningMappingJson.value).rules ?? []; } catch { return []; }
}

function moveReasoningRule(index: number, direction: -1 | 1) {
  const config = JSON.parse(reasoningMappingJson.value);
  const target = index + direction;
  if (target < 0 || target >= config.rules.length) return;
  [config.rules[index], config.rules[target]] = [config.rules[target], config.rules[index]];
  reasoningMappingJson.value = JSON.stringify(config, null, 2);
}

function removeReasoningRule(index: number) {
  const config = JSON.parse(reasoningMappingJson.value);
  config.rules.splice(index, 1);
  reasoningMappingJson.value = JSON.stringify(config, null, 2);
}

// A response is shown only while the provider it was requested for is still the selected one; a slower answer
// for a previous selection must not appear under the current one.
async function loadDiscovery() {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  try {
    const found = [...(await registry.listDiscovery(providerId))];
    if (selectedId.value === providerId) discovery.value = found;
  } catch (cause) {
    if (selectedId.value === providerId) error.value = errorText(cause, "registry_unavailable");
  }
}

async function ignoreDiscovery(streamPath: string) {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  error.value = "";
  try {
    const remaining = [...(await registry.ignoreDiscovery({ providerInstanceId: providerId, streamPath }))];
    if (selectedId.value === providerId) discovery.value = remaining;
  } catch (cause) {
    error.value = errorText(cause, "registry_unavailable");
  } finally {
    busy.value = false;
  }
}

async function acceptDiscovery(field: CompatibleDiscoveredResponseField) {
  const providerId = selected.value?.provider.providerInstanceId;
  try {
    const config = JSON.parse(reasoningMappingJson.value);
    config.rules = [
      ...(Array.isArray(config.rules) ? config.rules : []),
      { stream: { path: field.streamPath, mode: "append" }, semantic: "text" },
    ];
    reasoningMappingJson.value = JSON.stringify(config, null, 2);
  } catch (cause) {
    error.value = errorText(cause, "invalid_configuration");
    return;
  }
  await saveProfiles([field.streamPath]);
  if (providerId !== undefined && selectedId.value === providerId) await loadDiscovery();
}

async function loadModels() {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  try {
    const found = [
      ...(
        await catalog.query({
          providerInstanceId: providerId,
          includeStale: true,
          limit: 200,
        })
      ).items,
    ];
    if (selectedId.value === providerId) models.value = found;
  } catch (cause) {
    if (selectedId.value === providerId) error.value = errorText(cause, "compatible_catalog_sync_failed");
  }
}

async function syncModels() {
  if (!selected.value) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  try {
    await catalog.sync({
      providerInstanceId: providerId,
      requestId: crypto.randomUUID(),
      force: true,
    });
    if (selectedId.value === providerId) await loadModels();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "compatible_catalog_sync_failed";
  } finally {
    busy.value = false;
  }
}

async function addManualModel() {
  if (!selected.value || !manualModelId.value.trim()) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  error.value = "";
  const capability = (value: "unknown" | "yes" | "no") =>
    value === "unknown" ? null : value === "yes";
  // Main accepts only positive integers, so a typo is reported here instead of reaching it as NaN or a fraction.
  const positiveInteger = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("compatible_manual_limit_invalid");
    return parsed;
  };
  const price = (value: string) => value.trim() || null;
  try {
    await catalog.upsertManual({
      providerInstanceId: providerId,
      modelId: manualModelId.value.trim(),
      metadata: {
        schemaVersion: 1,
        displayName: manualDisplayName.value.trim() || null,
        contextLength: positiveInteger(manualContextLength.value),
        maxOutputTokens: positiveInteger(manualMaxOutputTokens.value),
        capabilities: {
          text: capability(manualTextCapability.value),
          vision: capability(manualVisionCapability.value),
          tools: capability(manualToolsCapability.value),
          structuredOutputs: capability(manualStructuredCapability.value),
          reasoning: capability(manualReasoningCapability.value),
        },
        pricing: {
          prompt: price(manualPromptPrice.value),
          completion: price(manualCompletionPrice.value),
          request: price(manualRequestPrice.value),
          image: price(manualImagePrice.value),
        },
      },
    });
    manualModelId.value = "";
    manualDisplayName.value = "";
    manualContextLength.value = "";
    manualMaxOutputTokens.value = "";
    manualTextCapability.value = "unknown";
    manualVisionCapability.value = "unknown";
    manualToolsCapability.value = "unknown";
    manualStructuredCapability.value = "unknown";
    manualReasoningCapability.value = "unknown";
    manualPromptPrice.value = "";
    manualCompletionPrice.value = "";
    manualRequestPrice.value = "";
    manualImagePrice.value = "";
    if (selectedId.value === providerId) await loadModels();
  } catch (cause) {
    error.value = errorText(cause, "compatible_catalog_sync_failed");
  } finally {
    busy.value = false;
  }
}

async function removeManualModel(modelId: string) {
  if (!selected.value || !window.confirm(t("settings.openAICompatible.deleteManualConfirm"))) return;
  const providerId = selected.value.provider.providerInstanceId;
  busy.value = true;
  error.value = "";
  try {
    await catalog.deleteManual({ providerInstanceId: providerId, modelId });
    if (selectedId.value === providerId) await loadModels();
  } catch (cause) {
    error.value = errorText(cause, "compatible_catalog_sync_failed");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-4"
    data-testid="compatible-provider-settings"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div
          class="sv-label"
        >
          {{ t("settings.openAICompatible.title") }}
        </div>
        <div class="sv-meta mt-1">
          {{ t("settings.openAICompatible.description") }}
        </div>
      </div>
      <div class="flex min-w-0 shrink-0 items-center gap-2">
        <span
          v-if="notice"
          class="flex min-w-0 items-center gap-1 text-xs text-gray-700"
        >
          <UiIcon name="check" :size="14" class="shrink-0" />
          <span class="min-w-0 break-words">{{ notice }}</span>
        </span>
        <button
          type="button"
          class="sv-btn sv-btn-sm shrink-0"
          :disabled="props.disabled || busy"
          @click="beginCreate"
        >
          <UiIcon name="plus" :size="14" />
          {{ t("settings.openAICompatible.addInstance") }}
        </button>
      </div>
    </div>
    <div v-if="error" class="sv-notice sv-notice-danger" role="alert">
      <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
      <span class="min-w-0 break-words">{{ error }}</span>
    </div>
    <div class="grid min-w-0 gap-x-6 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-0.5" data-testid="compatible-instance-list">
        <button
          v-for="item in providers"
          :key="item.provider.providerInstanceId"
          type="button"
          class="sv-row block w-full min-w-0 px-3 py-2 text-left text-xs"
          :class="selectedId === item.provider.providerInstanceId ? 'is-selected' : ''"
          :disabled="busy"
          @click="choose(item)"
        >
          <span class="font-medium text-gray-900">{{ item.provider.displayName }}</span
          ><span class="ml-1 text-gray-500">{{ item.provider.status }}</span>
        </button>
        <div v-if="providers.length === 0" class="sv-meta px-3 py-2">
          {{ t("settings.openAICompatible.empty") }}
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-4">
        <div class="grid gap-x-3 gap-y-3 sm:grid-cols-2">
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.name")
            }}<input
              v-model="displayName"
              data-testid="compatible-display-name"
              class="sv-input w-full"
          /></label>
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.baseUrl")
            }}<input
              v-model="baseUrl"
              data-testid="compatible-base-url"
              class="sv-input w-full"
          /></label>
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.securityPolicy")
            }}<select
              v-model="securityPolicy"
              class="sv-select w-full"
            >
              <option value="compatibility_first">compatibility_first</option>
              <option
                value="strict_ssrf"
                disabled
                :title="t('settings.openAICompatible.strictSsrfUnavailable')"
              >
                strict_ssrf · {{ t("settings.openAICompatible.strictSsrfUnavailable") }}
              </option>
            </select></label
          >
          <div
            v-if="securityPolicy === 'strict_ssrf'"
            class="sv-notice sv-notice-danger sm:col-span-2"
            role="alert"
            data-testid="compatible-strict-ssrf-unavailable"
          >
            <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0">{{ t("settings.openAICompatible.strictSsrfSavedUnavailable") }}</span>
          </div>
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.auth")
            }}<select
              v-model="authMode"
              data-testid="compatible-auth-mode"
              class="sv-select w-full"
            >
              <option value="none">none</option>
              <option value="bearer">bearer</option>
              <option value="basic">basic</option>
              <option value="custom_headers">custom_headers</option>
            </select></label
          >
          <label v-if="authMode === 'basic'" class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.username")
            }}<input
              v-model="username"
              autocomplete="off"
              class="sv-input w-full"
          /></label>
          <label
            v-if="authMode === 'bearer' || authMode === 'basic'"
            class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.secret")
            }}<input
              v-model="secret"
              type="password"
              autocomplete="new-password"
              data-testid="compatible-secret-input"
              class="sv-input w-full"
          /></label>
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.organization")
            }}<input
              v-model="organization"
              data-testid="compatible-organization"
              class="sv-input w-full"
          /></label>
          <label class="flex min-w-0 flex-col gap-1 text-xs text-gray-600"
            >{{ t("settings.openAICompatible.project")
            }}<input
              v-model="project"
              data-testid="compatible-project"
              class="sv-input w-full"
          /></label>
        </div>
        <div
          v-if="baseUrl.startsWith('http://')"
          class="sv-notice sv-notice-warning"
          data-testid="compatible-http-warning"
        >
          <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
          <span class="min-w-0">{{ t("settings.openAICompatible.httpWarning") }}</span>
        </div>
        <label class="flex flex-col gap-1 text-xs text-gray-600"
          >{{ t("settings.openAICompatible.headers")
          }}<textarea
            v-model="ordinaryHeaders"
            rows="2"
            class="sv-textarea w-full font-mono text-xs"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-gray-600"
          >{{ t("settings.openAICompatible.query")
          }}<textarea
            v-model="query"
            rows="2"
            class="sv-textarea w-full font-mono text-xs"
          />
        </label>
        <label v-if="authMode === 'custom_headers'" class="flex flex-col gap-1 text-xs text-gray-600"
          >{{ t("settings.openAICompatible.secretHeaders")
          }}<textarea
            v-model="customSecretHeaders"
            rows="2"
            class="sv-textarea w-full font-mono text-xs"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="compatible-save"
            class="sv-btn sv-btn-primary min-w-20"
            :disabled="props.disabled || busy"
            @click="() => save()"
          >
            {{ t("common.save") }}</button
          ><button
            v-if="selected"
            type="button"
            class="sv-btn"
            :disabled="busy"
            @click="testConnection"
          >
            {{ t("settings.openAICompatible.test") }}</button
          ><button
            v-if="selected"
            type="button"
            class="sv-btn sv-btn-danger"
            :disabled="busy"
            @click="removeProvider"
          >
            {{ t("common.delete") }}
          </button>
        </div>
        <div
          v-if="credentialStorageFallback"
          class="sv-notice sv-notice-warning flex-col"
          data-testid="compatible-credential-storage-choice"
        >
          <div class="flex items-start gap-2">
            <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <p>{{ t("settings.credentials.secureStorageUnavailableBody") }}</p>
              <p v-if="plaintextPersistenceSupported" class="mt-1 font-medium">{{ t("settings.credentials.plaintextWarning") }}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 pl-5">
            <button type="button" class="sv-btn sv-btn-sm" :disabled="busy" @click="save('session')">{{ t("settings.credentials.sessionOnly") }}</button>
            <button v-if="plaintextPersistenceSupported" data-testid="compatible-save-plaintext" type="button" class="sv-btn sv-btn-sm sv-btn-danger" :disabled="busy" @click="save('plaintext')">{{ t("settings.credentials.savePlaintext") }}</button>
            <button type="button" class="sv-btn sv-btn-sm" :disabled="busy" @click="credentialStorageFallback = false">{{ t("common.cancel") }}</button>
          </div>
        </div>
        <pre
          v-if="diagnostics"
          class="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--sv-sunken)] p-2 text-xs text-gray-700"
          >{{ JSON.stringify(diagnostics, null, 2) }}</pre>
        <div v-if="selected?.credentials.length" class="sv-divider-t pt-4 text-xs" data-testid="compatible-credential-list">
          <div class="sv-label">Credential versions</div>
          <div class="mt-2">
          <div v-for="credentialItem in selected.credentials" :key="credentialItem.credentialVersionRef" class="sv-divider-t flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:border-t-0 first:pt-0">
            <code class="min-w-0 break-all">{{ credentialItem.credentialVersionRef }}</code>
            <span class="text-gray-600">{{ credentialItem.maskState }}</span>
            <span class="text-gray-600" data-testid="compatible-credential-availability">{{ credentialItem.availability }}</span>
            <span v-if="credentialItem.storageBackend" class="text-gray-600" data-testid="compatible-credential-backend">{{ credentialItem.storageBackend }}</span>
            <span v-if="credentialItem.sessionOverridesPersistent" class="text-gray-600" data-testid="compatible-credential-session-override">session_override</span>
            <code v-if="credentialItem.diagnosticCode" class="break-all text-[var(--sv-warning)]" data-testid="compatible-credential-diagnostic">{{ credentialItem.diagnosticCode }}</code>
            <button type="button" class="sv-btn sv-btn-sm sv-btn-danger ml-auto" :disabled="selected.endpointRevisions[0]?.credentialVersionRef === credentialItem.credentialVersionRef || credentialItem.deletedAtMs !== null" @click="removeCredential(credentialItem.credentialVersionRef)">{{ t("common.delete") }}</button>
          </div>
          </div>
        </div>
        <div v-if="selected" class="sv-divider-t flex flex-col gap-3 pt-4">
          <div class="flex items-center justify-between gap-2">
            <span class="sv-label">{{
              t("settings.openAICompatible.models")
            }}</span
            ><button
              type="button"
              class="sv-btn sv-btn-sm"
              :disabled="busy"
              @click="syncModels"
            >
              {{ t("settings.openAICompatible.sync") }}
            </button>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <input
              v-model="manualModelId"
              class="sv-input sv-input-sm min-w-0"
              :placeholder="t('settings.openAICompatible.manualModel')"
            /><input
              v-model="manualDisplayName"
              class="sv-input sv-input-sm min-w-0"
              placeholder="display name (optional)"
            /><input
              v-model="manualContextLength"
              inputmode="numeric"
              class="sv-input sv-input-sm min-w-0"
              placeholder="context length (unknown if empty)"
            /><input
              v-model="manualMaxOutputTokens"
              inputmode="numeric"
              class="sv-input sv-input-sm min-w-0"
              placeholder="max output tokens"
            /><label class="flex items-center gap-2 text-xs text-gray-600"
              >text<select
                v-model="manualTextCapability"
                class="sv-select sv-select-sm min-w-0 flex-1"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="flex items-center gap-2 text-xs text-gray-600"
              >vision<select
                v-model="manualVisionCapability"
                class="sv-select sv-select-sm min-w-0 flex-1"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="flex items-center gap-2 text-xs text-gray-600"
              >tools<select
                v-model="manualToolsCapability"
                class="sv-select sv-select-sm min-w-0 flex-1"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="flex items-center gap-2 text-xs text-gray-600"
              >structured<select
                v-model="manualStructuredCapability"
                class="sv-select sv-select-sm min-w-0 flex-1"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="flex items-center gap-2 text-xs text-gray-600"
              >reasoning<select
                v-model="manualReasoningCapability"
                class="sv-select sv-select-sm min-w-0 flex-1"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><input
              v-model="manualPromptPrice"
              class="sv-input sv-input-sm min-w-0"
              placeholder="prompt price"
            /><input
              v-model="manualCompletionPrice"
              class="sv-input sv-input-sm min-w-0"
              placeholder="completion price"
            /><input
              v-model="manualRequestPrice"
              class="sv-input sv-input-sm min-w-0"
              placeholder="request price"
            /><input
              v-model="manualImagePrice"
              class="sv-input sv-input-sm min-w-0"
              placeholder="image price"
            /><div class="flex sm:col-span-2"><button
              type="button"
              data-testid="compatible-add-manual-model"
              class="sv-btn sv-btn-sm"
              @click="addManualModel"
            >
              {{ t("common.add") }}
            </button></div>
          </div>
          <ul class="max-h-56 overflow-auto text-xs">
            <li
              v-for="model in models"
              :key="model.modelId"
              class="sv-divider-t py-2 first:border-t-0"
            >
              <span class="break-all font-mono text-gray-900">{{ model.modelId }}</span>
              <span class="text-gray-500"
                >{{
                  model.sourcePresence.manual && model.sourcePresence.remote !== "absent"
                    ? "manual + remote"
                    : model.sourcePresence.manual
                      ? "manual"
                      : model.sourcePresence.remote === "stale"
                        ? "remote stale"
                        : "remote"
                }}
                · text={{ model.metadata.capabilities.text ?? "unknown" }} ·
                ctx={{ model.metadata.contextLength ?? "unknown" }} · prompt={{
                  model.metadata.pricing.prompt ?? "unknown"
                }}</span
              >
              <div v-if="model.conflictFields.length" class="text-[var(--sv-warning)]">
                conflicts: {{ model.conflictFields.join(", ") }}
              </div>
              <div class="sv-meta break-all">
              provenance: {{ JSON.stringify(model.metadata.fieldProvenance) }}
              </div>
              <button v-if="model.sourcePresence.manual" type="button" class="sv-btn sv-btn-sm sv-btn-danger mt-1" @click="removeManualModel(model.modelId)">{{ t("common.delete") }}</button>
            </li>
          </ul>
        </div>
        <details
          v-if="selected?.activeConfiguration"
          class="sv-divider-t pt-4"
        >
          <summary class="cursor-pointer text-xs font-medium text-gray-900">
            {{ t("settings.openAICompatible.profiles") }}
          </summary>
          <div class="mt-3 grid gap-3">
            <label class="flex flex-col gap-1 text-xs text-gray-600"
              >request profile<textarea
                v-model="requestProfileJson"
                data-testid="compatible-request-profile"
                rows="8"
                class="sv-textarea w-full font-mono text-xs"
              /></label
            ><label class="flex flex-col gap-1 text-xs text-gray-600">extraBody<textarea
                v-model="extraBodyJson"
                data-testid="compatible-extra-body"
                rows="6"
                class="sv-textarea w-full font-mono text-xs"
              /></label
            ><div class="text-xs text-gray-600" data-testid="compatible-request-reasoning-preset">
              <label class="flex flex-wrap items-center gap-2">request reasoning preset
                <select v-model="requestReasoningPreset" class="sv-select sv-select-sm" @change="applyRequestReasoningPreset">
                  <option value="disabled">disabled</option>
                  <option value="openai_reasoning_effort">openai_reasoning_effort</option>
                  <option value="chat_template_enable_thinking">chat_template_enable_thinking</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <div class="sv-meta mt-1">Presets are explicit and never selected from the endpoint URL, model name, response, or failure.</div>
            </div><div class="text-xs text-gray-600" data-testid="compatible-reasoning-mode-controls">
              <label class="flex flex-wrap items-center gap-2">reasoning mode
                <select v-model="reasoningMode" data-testid="compatible-reasoning-mode" class="sv-select sv-select-sm">
                  <option value="custom_preferred_with_builtin_fallback">custom preferred, then built-in</option>
                  <option value="custom_only">custom only</option>
                </select>
              </label>
              <div class="sv-meta mt-1">The first valid source is locked per choice and never switches during that response.</div>
              <ol class="mt-2 flex flex-col">
                <li v-for="(rule, index) in orderedReasoningRules()" :key="`${rule.stream?.path}:${index}`" class="sv-divider-t flex items-center gap-1 py-1 first:border-t-0">
                  <code class="min-w-0 flex-1 truncate">{{ index + 1 }}. {{ rule.stream?.path }}</code>
                  <button type="button" class="sv-icon-btn" aria-label="Move up" title="Move up" :disabled="index === 0" @click="moveReasoningRule(index, -1)"><UiIcon name="up" :size="14" /></button>
                  <button type="button" class="sv-icon-btn" aria-label="Move down" title="Move down" :disabled="index === orderedReasoningRules().length - 1" @click="moveReasoningRule(index, 1)"><UiIcon name="down" :size="14" /></button>
                  <button type="button" class="sv-icon-btn" aria-label="Remove" title="Remove" @click="removeReasoningRule(index)"><UiIcon name="close" :size="14" /></button>
                </li>
              </ol>
            </div><label class="flex flex-col gap-1 text-xs text-gray-600"
              >request mappings<textarea
                v-model="requestMappingsJson"
                rows="8"
                class="sv-textarea w-full font-mono text-xs"
              /></label
            ><label class="flex flex-col gap-1 text-xs text-gray-600"
              >reasoning mapping<textarea
                v-model="reasoningMappingJson"
                rows="8"
                class="sv-textarea w-full font-mono text-xs"
              /></label
            ><label class="flex flex-col gap-1 text-xs text-gray-600"
              >inline policy<textarea
                v-model="inlinePolicyJson"
                rows="8"
                class="sv-textarea w-full font-mono text-xs"
              /></label
            ><button
              type="button"
              data-testid="compatible-save-profiles"
              class="sv-btn justify-self-start"
              :disabled="busy || props.disabled"
              @click="saveProfiles()"
            >
              {{ t("settings.openAICompatible.saveProfiles") }}
            </button>
          </div>
        </details>
        <div
          v-if="selected && discovery.length"
          class="sv-divider-t pt-4"
          data-testid="compatible-discovery"
        >
          <div class="sv-label">
            {{ t("settings.openAICompatible.discovery") }}
          </div>
          <div class="mt-2">
          <div
            v-for="field in discovery"
            :key="field.streamPath"
            class="sv-divider-t py-2 text-xs first:border-t-0 first:pt-0"
          >
            <code class="break-all">{{ field.streamPath }}</code
            ><span class="ml-2 text-gray-500"
              >{{ field.aggregate.observedShapes.join(", ") }} ·
              {{ field.occurrenceCount }}</span
            >
            <div v-if="field.state === 'candidate'" class="mt-1 flex gap-2">
              <button
                type="button"
                class="sv-btn sv-btn-sm"
                :disabled="
                  !field.aggregate.observedShapes.some(
                    (shape) => shape === 'string' || shape === 'array',
                  )
                "
                @click="acceptDiscovery(field)"
              >
                {{ t("settings.openAICompatible.acceptReasoning") }}</button
              ><button
                type="button"
                class="sv-btn sv-btn-sm sv-btn-ghost"
                @click="ignoreDiscovery(field.streamPath)"
              >
                {{ t("settings.openAICompatible.ignore") }}
              </button>
            </div>
            <span v-else class="ml-2">{{ field.state }}</span>
          </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
