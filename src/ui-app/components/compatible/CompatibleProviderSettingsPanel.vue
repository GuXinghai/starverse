<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { createCompatibleProviderRegistryClient } from "@/next/provider/openai-chat-compatible/ui";
import { createCompatibleCatalogClient } from "@/next/modelCatalog/compatibleCatalogClient";
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
  try {
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
    if (!selected.value)
      details = await registry.create({
        displayName: displayName.value,
        endpoint,
        credential: credential(),
        ...(storageMode === undefined ? {} : { storageMode }),
        requestMappings: [],
      });
    else {
      details = await registry.update({
        providerInstanceId: selected.value.provider.providerInstanceId,
        displayName: displayName.value,
      });
      details = await registry.updateEndpoint({
        providerInstanceId: details.provider.providerInstanceId,
        endpoint,
        credential: authMode.value === "none"
          ? { mode: "none" as const }
          : (secret.value || customSecretHeaders.value)
            ? credential()
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
      authMode.value !== "none" && Boolean(secret.value || customSecretHeaders.value);
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
  const details = await registry.deleteCredential(credentialVersionRef);
  providers.value = providers.value.map((item) => item.provider.providerInstanceId === details.provider.providerInstanceId ? details : item);
  choose(details);
}

async function testConnection() {
  if (!selected.value) return;
  busy.value = true;
  diagnostics.value = null;
  try {
    diagnostics.value = await registry.testConnection(
      selected.value.provider.providerInstanceId,
      crypto.randomUUID(),
    ) as CompatibleConnectionTestResult;
  } finally {
    busy.value = false;
  }
}

async function saveProfiles(acceptedDiscoveryPaths: readonly string[] = []) {
  if (!selected.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const requestProfile = JSON.parse(requestProfileJson.value);
    const defaultExtraBody = JSON.parse(extraBodyJson.value);
    const details = await registry.reviseConfiguration({
      providerInstanceId: selected.value.provider.providerInstanceId,
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
    choose(details);
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
      ? [{ sourceField: "reasoning_effort", targetPath: ["reasoning_effort"], valueKind: "string",
          valueMapping: { low: "low", medium: "medium", high: "high" }, omission: "omit_when_unset" }]
      : [{ sourceField: "reasoning_enabled", targetPath: ["chat_template_kwargs", "enable_thinking"], valueKind: "boolean",
          valueMapping: { true: true, false: false }, omission: "omit_when_unset" }];
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

async function loadDiscovery() {
  if (!selected.value) return;
  try {
    discovery.value = [
      ...(await registry.listDiscovery(
        selected.value.provider.providerInstanceId,
      )),
    ];
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "registry_unavailable";
  }
}

async function ignoreDiscovery(streamPath: string) {
  if (!selected.value) return;
  discovery.value = [
    ...(await registry.ignoreDiscovery({
      providerInstanceId: selected.value.provider.providerInstanceId,
      streamPath,
    })),
  ];
}

async function acceptDiscovery(field: CompatibleDiscoveredResponseField) {
  const config = JSON.parse(reasoningMappingJson.value);
  config.rules = [
    ...config.rules,
    { stream: { path: field.streamPath, mode: "append" }, semantic: "text" },
  ];
  reasoningMappingJson.value = JSON.stringify(config, null, 2);
  await saveProfiles([field.streamPath]);
  await loadDiscovery();
}

async function loadModels() {
  if (!selected.value) return;
  try {
    models.value = [
      ...(
        await catalog.query({
          providerInstanceId: selected.value.provider.providerInstanceId,
          includeStale: true,
          limit: 200,
        })
      ).items,
    ];
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "compatible_catalog_sync_failed";
  }
}

async function syncModels() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await catalog.sync({
      providerInstanceId: selected.value.provider.providerInstanceId,
      requestId: crypto.randomUUID(),
      force: true,
    });
    await loadModels();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "compatible_catalog_sync_failed";
  } finally {
    busy.value = false;
  }
}

async function addManualModel() {
  if (!selected.value || !manualModelId.value.trim()) return;
  busy.value = true;
  const capability = (value: "unknown" | "yes" | "no") =>
    value === "unknown" ? null : value === "yes";
  const positiveInteger = (value: string) =>
    value.trim() ? Number(value) : null;
  const price = (value: string) => value.trim() || null;
  try {
    await catalog.upsertManual({
      providerInstanceId: selected.value.provider.providerInstanceId,
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
    await loadModels();
  } finally {
    busy.value = false;
  }
}

async function removeManualModel(modelId: string) {
  if (!selected.value || !window.confirm(t("settings.openAICompatible.deleteManualConfirm"))) return;
  await catalog.deleteManual({ providerInstanceId: selected.value.provider.providerInstanceId, modelId });
  await loadModels();
}

onMounted(load);
</script>

<template>
  <section
    class="rounded-lg border border-gray-200 bg-white p-3"
    data-testid="compatible-provider-settings"
  >
    <div class="flex items-center justify-between gap-2">
      <div>
        <div
          class="text-xs font-semibold uppercase tracking-wide text-gray-600"
        >
          {{ t("settings.openAICompatible.title") }}
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          {{ t("settings.openAICompatible.description") }}
        </div>
      </div>
      <button
        type="button"
        class="rounded border px-2 py-1 text-xs"
        :disabled="props.disabled || busy"
        @click="beginCreate"
      >
        {{ t("settings.openAICompatible.addInstance") }}
      </button>
    </div>
    <div v-if="error" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
      {{ error }}
    </div>
    <div
      v-if="notice"
      class="mt-2 rounded bg-green-50 p-2 text-xs text-green-800"
    >
      {{ notice }}
    </div>
    <div class="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
      <div class="space-y-1" data-testid="compatible-instance-list">
        <button
          v-for="item in providers"
          :key="item.provider.providerInstanceId"
          type="button"
          class="block w-full rounded border px-2 py-2 text-left text-xs"
          :class="
            selectedId === item.provider.providerInstanceId
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200'
          "
          @click="choose(item)"
        >
          <span class="font-medium">{{ item.provider.displayName }}</span
          ><span class="ml-1 text-gray-500">{{ item.provider.status }}</span>
        </button>
        <div v-if="providers.length === 0" class="text-xs text-gray-500">
          {{ t("settings.openAICompatible.empty") }}
        </div>
      </div>
      <div class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="text-xs"
            >{{ t("settings.openAICompatible.name")
            }}<input
              v-model="displayName"
              data-testid="compatible-display-name"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
          <label class="text-xs"
            >{{ t("settings.openAICompatible.baseUrl")
            }}<input
              v-model="baseUrl"
              data-testid="compatible-base-url"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
          <label class="text-xs"
            >{{ t("settings.openAICompatible.securityPolicy")
            }}<select
              v-model="securityPolicy"
              class="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="compatibility_first">compatibility_first</option>
              <option value="strict_ssrf">strict_ssrf</option>
            </select></label
          >
          <label class="text-xs"
            >{{ t("settings.openAICompatible.auth")
            }}<select
              v-model="authMode"
              data-testid="compatible-auth-mode"
              class="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="none">none</option>
              <option value="bearer">bearer</option>
              <option value="basic">basic</option>
              <option value="custom_headers">custom_headers</option>
            </select></label
          >
          <label v-if="authMode === 'basic'" class="text-xs"
            >{{ t("settings.openAICompatible.username")
            }}<input
              v-model="username"
              autocomplete="off"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
          <label
            v-if="authMode === 'bearer' || authMode === 'basic'"
            class="text-xs"
            >{{ t("settings.openAICompatible.secret")
            }}<input
              v-model="secret"
              type="password"
              autocomplete="new-password"
              data-testid="compatible-secret-input"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
          <label class="text-xs"
            >{{ t("settings.openAICompatible.organization")
            }}<input
              v-model="organization"
              data-testid="compatible-organization"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
          <label class="text-xs"
            >{{ t("settings.openAICompatible.project")
            }}<input
              v-model="project"
              data-testid="compatible-project"
              class="mt-1 w-full rounded border px-2 py-1"
          /></label>
        </div>
        <div
          v-if="baseUrl.startsWith('http://')"
          class="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          data-testid="compatible-http-warning"
        >
          {{ t("settings.openAICompatible.httpWarning") }}
        </div>
        <label class="block text-xs"
          >{{ t("settings.openAICompatible.headers")
          }}<textarea
            v-model="ordinaryHeaders"
            rows="2"
            class="mt-1 w-full rounded border px-2 py-1 font-mono"
          />
        </label>
        <label class="block text-xs"
          >{{ t("settings.openAICompatible.query")
          }}<textarea
            v-model="query"
            rows="2"
            class="mt-1 w-full rounded border px-2 py-1 font-mono"
          />
        </label>
        <label v-if="authMode === 'custom_headers'" class="block text-xs"
          >{{ t("settings.openAICompatible.secretHeaders")
          }}<textarea
            v-model="customSecretHeaders"
            rows="2"
            class="mt-1 w-full rounded border px-2 py-1 font-mono"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="compatible-save"
            class="rounded bg-blue-600 px-3 py-1 text-xs text-white"
            :disabled="props.disabled || busy"
            @click="() => save()"
          >
            {{ t("common.save") }}</button
          ><button
            v-if="selected"
            type="button"
            class="rounded border px-3 py-1 text-xs"
            :disabled="busy"
            @click="testConnection"
          >
            {{ t("settings.openAICompatible.test") }}</button
          ><button
            v-if="selected"
            type="button"
            class="rounded border border-red-300 px-3 py-1 text-xs text-red-700"
            :disabled="busy"
            @click="removeProvider"
          >
            {{ t("common.delete") }}
          </button>
        </div>
        <div
          v-if="credentialStorageFallback"
          class="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950"
          data-testid="compatible-credential-storage-choice"
        >
          <p>{{ t("settings.credentials.secureStorageUnavailableBody") }}</p>
          <p v-if="plaintextPersistenceSupported" class="mt-1 font-medium">{{ t("settings.credentials.plaintextWarning") }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="rounded border px-2 py-1" :disabled="busy" @click="save('session')">{{ t("settings.credentials.sessionOnly") }}</button>
            <button v-if="plaintextPersistenceSupported" data-testid="compatible-save-plaintext" type="button" class="rounded border border-amber-700 px-2 py-1" :disabled="busy" @click="save('plaintext')">{{ t("settings.credentials.savePlaintext") }}</button>
            <button type="button" class="rounded border px-2 py-1" :disabled="busy" @click="credentialStorageFallback = false">{{ t("common.cancel") }}</button>
          </div>
        </div>
        <pre
          v-if="diagnostics"
          class="max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px]"
          >{{ JSON.stringify(diagnostics, null, 2) }}</pre>
        <div v-if="selected?.credentials.length" class="rounded border p-2 text-xs" data-testid="compatible-credential-list">
          <div class="font-semibold">Credential versions</div>
          <div v-for="credentialItem in selected.credentials" :key="credentialItem.credentialVersionRef" class="mt-1 flex items-center gap-2">
            <code>{{ credentialItem.credentialVersionRef }}</code>
            <span>{{ credentialItem.maskState }}</span>
            <span data-testid="compatible-credential-availability">{{ credentialItem.availability }}</span>
            <span v-if="credentialItem.storageBackend" data-testid="compatible-credential-backend">{{ credentialItem.storageBackend }}</span>
            <span v-if="credentialItem.sessionOverridesPersistent" data-testid="compatible-credential-session-override">session_override</span>
            <code v-if="credentialItem.diagnosticCode" data-testid="compatible-credential-diagnostic">{{ credentialItem.diagnosticCode }}</code>
            <button type="button" class="rounded border px-2 py-1" :disabled="selected.endpointRevisions[0]?.credentialVersionRef === credentialItem.credentialVersionRef || credentialItem.deletedAtMs !== null" @click="removeCredential(credentialItem.credentialVersionRef)">{{ t("common.delete") }}</button>
          </div>
        </div>
        <div v-if="selected" class="rounded border p-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold">{{
              t("settings.openAICompatible.models")
            }}</span
            ><button
              type="button"
              class="rounded border px-2 py-1 text-xs"
              :disabled="busy"
              @click="syncModels"
            >
              {{ t("settings.openAICompatible.sync") }}
            </button>
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              v-model="manualModelId"
              class="rounded border px-2 py-1 text-xs"
              :placeholder="t('settings.openAICompatible.manualModel')"
            /><input
              v-model="manualDisplayName"
              class="rounded border px-2 py-1 text-xs"
              placeholder="display name (optional)"
            /><input
              v-model="manualContextLength"
              inputmode="numeric"
              class="rounded border px-2 py-1 text-xs"
              placeholder="context length (unknown if empty)"
            /><input
              v-model="manualMaxOutputTokens"
              inputmode="numeric"
              class="rounded border px-2 py-1 text-xs"
              placeholder="max output tokens"
            /><label class="text-[10px]"
              >text<select
                v-model="manualTextCapability"
                class="ml-1 rounded border"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="text-[10px]"
              >vision<select
                v-model="manualVisionCapability"
                class="ml-1 rounded border"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="text-[10px]"
              >tools<select
                v-model="manualToolsCapability"
                class="ml-1 rounded border"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="text-[10px]"
              >structured<select
                v-model="manualStructuredCapability"
                class="ml-1 rounded border"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><label class="text-[10px]"
              >reasoning<select
                v-model="manualReasoningCapability"
                class="ml-1 rounded border"
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select></label
            ><input
              v-model="manualPromptPrice"
              class="rounded border px-2 py-1 text-xs"
              placeholder="prompt price"
            /><input
              v-model="manualCompletionPrice"
              class="rounded border px-2 py-1 text-xs"
              placeholder="completion price"
            /><input
              v-model="manualRequestPrice"
              class="rounded border px-2 py-1 text-xs"
              placeholder="request price"
            /><input
              v-model="manualImagePrice"
              class="rounded border px-2 py-1 text-xs"
              placeholder="image price"
            /><button
              type="button"
              data-testid="compatible-add-manual-model"
              class="rounded border px-2 py-1 text-xs"
              @click="addManualModel"
            >
              {{ t("common.add") }}
            </button>
          </div>
          <ul class="mt-2 max-h-56 overflow-auto text-xs">
            <li
              v-for="model in models"
              :key="model.modelId"
              class="border-t py-1"
            >
              <span class="font-mono">{{ model.modelId }}</span>
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
              <div v-if="model.conflictFields.length" class="text-amber-700">
                conflicts: {{ model.conflictFields.join(", ") }}
              </div>
              <div class="text-[10px] text-gray-500">
              provenance: {{ JSON.stringify(model.metadata.fieldProvenance) }}
              </div>
              <button v-if="model.sourcePresence.manual" type="button" class="mt-1 rounded border px-2 py-1" @click="removeManualModel(model.modelId)">{{ t("common.delete") }}</button>
            </li>
          </ul>
        </div>
        <details
          v-if="selected?.activeConfiguration"
          class="rounded border p-2"
        >
          <summary class="cursor-pointer text-xs font-semibold">
            {{ t("settings.openAICompatible.profiles") }}
          </summary>
          <div class="mt-2 grid gap-2">
            <label class="text-xs"
              >request profile<textarea
                v-model="requestProfileJson"
                data-testid="compatible-request-profile"
                rows="8"
                class="mt-1 w-full rounded border p-2 font-mono text-[10px]"
              /></label
            ><label class="text-xs">extraBody<textarea
                v-model="extraBodyJson"
                data-testid="compatible-extra-body"
                rows="6"
                class="mt-1 w-full rounded border p-2 font-mono text-[10px]"
              /></label
            ><div class="rounded border bg-gray-50 p-2 text-xs" data-testid="compatible-request-reasoning-preset">
              <label>request reasoning preset
                <select v-model="requestReasoningPreset" class="ml-2 rounded border px-2 py-1" @change="applyRequestReasoningPreset">
                  <option value="disabled">disabled</option>
                  <option value="openai_reasoning_effort">openai_reasoning_effort</option>
                  <option value="chat_template_enable_thinking">chat_template_enable_thinking</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <div class="mt-1 text-[10px] text-gray-600">Presets are explicit and never selected from the endpoint URL, model name, response, or failure.</div>
            </div><div class="rounded border bg-gray-50 p-2 text-xs" data-testid="compatible-reasoning-mode-controls">
              <label>reasoning mode
                <select v-model="reasoningMode" data-testid="compatible-reasoning-mode" class="ml-2 rounded border px-2 py-1">
                  <option value="custom_preferred_with_builtin_fallback">custom preferred, then built-in</option>
                  <option value="custom_only">custom only</option>
                </select>
              </label>
              <div class="mt-1 text-[10px] text-gray-600">The first valid source is locked per choice and never switches during that response.</div>
              <ol class="mt-2 space-y-1">
                <li v-for="(rule, index) in orderedReasoningRules()" :key="`${rule.stream?.path}:${index}`" class="flex items-center gap-1 rounded bg-white p-1">
                  <code class="min-w-0 flex-1 truncate">{{ index + 1 }}. {{ rule.stream?.path }}</code>
                  <button type="button" :disabled="index === 0" @click="moveReasoningRule(index, -1)">↑</button>
                  <button type="button" :disabled="index === orderedReasoningRules().length - 1" @click="moveReasoningRule(index, 1)">↓</button>
                  <button type="button" @click="removeReasoningRule(index)">×</button>
                </li>
              </ol>
            </div><label class="text-xs"
              >request mappings<textarea
                v-model="requestMappingsJson"
                rows="8"
                class="mt-1 w-full rounded border p-2 font-mono text-[10px]"
              /></label
            ><label class="text-xs"
              >reasoning mapping<textarea
                v-model="reasoningMappingJson"
                rows="8"
                class="mt-1 w-full rounded border p-2 font-mono text-[10px]"
              /></label
            ><label class="text-xs"
              >inline policy<textarea
                v-model="inlinePolicyJson"
                rows="8"
                class="mt-1 w-full rounded border p-2 font-mono text-[10px]"
              /></label
            ><button
              type="button"
              data-testid="compatible-save-profiles"
              class="justify-self-start rounded border px-3 py-1 text-xs"
              :disabled="busy || props.disabled"
              @click="saveProfiles()"
            >
              {{ t("settings.openAICompatible.saveProfiles") }}
            </button>
          </div>
        </details>
        <div
          v-if="selected && discovery.length"
          class="rounded border p-2"
          data-testid="compatible-discovery"
        >
          <div class="text-xs font-semibold">
            {{ t("settings.openAICompatible.discovery") }}
          </div>
          <div
            v-for="field in discovery"
            :key="field.streamPath"
            class="mt-2 rounded bg-gray-50 p-2 text-xs"
          >
            <code>{{ field.streamPath }}</code
            ><span class="ml-2 text-gray-500"
              >{{ field.aggregate.observedShapes.join(", ") }} ·
              {{ field.occurrenceCount }}</span
            >
            <div v-if="field.state === 'candidate'" class="mt-1 flex gap-2">
              <button
                type="button"
                class="rounded border px-2 py-1"
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
                class="rounded border px-2 py-1"
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
  </section>
</template>
