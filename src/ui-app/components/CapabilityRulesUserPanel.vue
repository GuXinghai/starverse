<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { migrateCapabilityRuleCoreRuleV1ToV2 } from '@/next/generation-v2/capability-rules/capabilityRuleCoreV2'
import { decodeUserRulePackTransferV2 } from '@/next/generation-v2/capability-rules/userRulePackTransferV2'

type Configured = 'default' | 'on' | 'off'
type PackMode = 'override' | 'default_only' | 'no_control'
type PackTarget = 'enabled' | 'disabled'
type Rule = Readonly<{
  ruleId: string
  label: string | null
  description: string | null
  priority: number
  configured: Configured
  providerAuthorityId: string
  endpointProfileId: string
  selector: Readonly<{ kind: 'exact'; nativeModelIds: readonly string[] } | {
    kind: 'regex'; pattern: string; positiveExamples: readonly string[]; negativeExamples: readonly string[]
  }>
  assertion?: Readonly<{ path: string; value: unknown }>
  category?: string
  effect?: Readonly<{ kind: string; path?: string; value?: unknown; code?: string; operationId?: string;
    mappings?: readonly Readonly<{ from: string; to: string }>[] }>
  decisionKey?: string
  dependencies?: readonly string[]
  evidence: unknown
}>
type Pack = Readonly<{
  schemaVersion?: 1 | 2
  packId: string
  displayName: string
  description: string | null
  priority: number
  mode: PackMode
  target: PackTarget
  rules: readonly Rule[]
}>
type Snapshot = Readonly<{ schemaVersion: 1 | 2; ownership: 'user'; ownerId: string; packs: readonly Pack[] }>
type Draft = Readonly<{
  sessionId: string
  draftRevision: number
  dirty: boolean
  projected: Readonly<{ definition: Snapshot }>
  notes: readonly Readonly<{ ruleId: string; note: string }>[]
}>

type UserCapabilityRuleApi = Readonly<{
  readCommitted: () => Promise<unknown>
  readDraft: () => Promise<unknown>
  openDraft: () => Promise<unknown>
  replaceDraft: (payload: unknown) => Promise<unknown>
  addRule: (payload: unknown) => Promise<unknown>
  rewritePack: (payload: unknown) => Promise<unknown>
  importPack: (payload: unknown) => Promise<unknown>
  exportCommittedPack: (payload: unknown) => Promise<unknown>
  saveDraft: (payload: unknown) => Promise<unknown>
  cancelDraft: (payload: unknown) => Promise<unknown>
}>

const draft = ref<Draft | null>(null)
const committed = ref<Snapshot | null>(null)
const schemaVersion = ref<1 | 2>(1)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const editing = ref(false)
const pendingRuleDelete = ref<string | null>(null)
const pendingPackDelete = ref<string | null>(null)
const addRuleOpen = ref(false)
const moveRuleId = ref<string | null>(null)
const selectedPackId = ref<string | null>(null)
const selectedRuleId = ref<string | null>(null)
const addForm = ref({
  packId: '', packDisplayName: '', ruleId: '', providerAuthorityId: '', endpointProfileId: '',
  nativeModelId: '', support: 'supported' as 'supported' | 'unsupported',
})

function bridge() {
  const value = window.generationV2?.capabilityRules?.user
  if (!value) throw new Error('GENERATION_V2_CAPABILITY_RULES_UNAVAILABLE')
  return value
}

function bridgeV2() {
  return window.generationV2?.capabilityRules?.user?.v2 ?? null
}

function userApi(): UserCapabilityRuleApi {
  const value = schemaVersion.value === 2 ? bridgeV2() : bridge()
  if (!value) throw new Error('GENERATION_V2_CAPABILITY_RULES_UNAVAILABLE')
  return value as UserCapabilityRuleApi
}

function snapshotOf(value: Draft): Snapshot {
  return value.projected.definition
}

function packs(): readonly Pack[] {
  return draft.value && editing.value ? snapshotOf(draft.value).packs : committed.value?.packs ?? []
}

function selectedPack(): Pack | null {
  const packId = selectedPackId.value
  return packId ? packs().find((pack) => pack.packId === packId) ?? null : null
}

function selectedRule(): Rule | null {
  const pack = selectedPack()
  const ruleId = selectedRuleId.value
  return pack && ruleId ? pack.rules.find((rule) => rule.ruleId === ruleId) ?? null : null
}

function selectorSummary(rule: Rule): string {
  return rule.selector.kind === 'exact'
    ? rule.selector.nativeModelIds.join(', ')
    : rule.selector.pattern
}

function ruleEffectPath(rule: Rule): string {
  return rule.assertion?.path ?? rule.effect?.path ?? rule.category ?? ''
}

function ruleEffectText(rule: Rule): string {
  if (rule.assertion) return JSON.stringify(rule.assertion.value)
  const effect = rule.effect
  if (!effect) return ''
  if (effect.kind === 'fact_assertion' || effect.kind === 'fact_default') return JSON.stringify(effect.value)
  if (effect.kind === 'enum_mapping') return JSON.stringify(effect.mappings ?? [])
  if (effect.kind === 'validation') return effect.code ?? effect.kind
  return effect.operationId ?? effect.kind
}

function showPack(packId: string) {
  selectedPackId.value = packId
  selectedRuleId.value = null
}

function showRule(ruleId: string) {
  selectedRuleId.value = ruleId
}

function backToPacks() {
  selectedPackId.value = null
  selectedRuleId.value = null
}

function backToRules() {
  selectedRuleId.value = null
}

function draftSnapshot(packsValue: readonly Pack[]): Snapshot {
  const base = draft.value
  if (!base) throw new Error('GENERATION_V2_USER_CAPABILITY_RULES_DRAFT_NOT_OPEN')
  return Object.freeze({ schemaVersion: schemaVersion.value, ownership: 'user', ownerId: base.projected.definition.ownerId,
    packs: Object.freeze([...packsValue]) })
}


async function load() {
  loading.value = true
  error.value = null
  try {
    const [legacyCommittedResult, legacyDraftResult] = await Promise.all([
      bridge().readCommitted(), bridge().readDraft(),
    ]) as [
      Readonly<{ snapshot: Readonly<{ projected: Readonly<{ definition: Snapshot }> }> | null }>, Draft | null,
    ]
    const v2Api = bridgeV2()
    const [v2CommittedResult, v2DraftResult] = v2Api ? await Promise.all([
      v2Api.readCommitted(), v2Api.readDraft(),
    ]) as [Readonly<{ snapshot: Readonly<{ projected: Readonly<{ definition: Snapshot }> }> | null }>, Draft | null]
      : [null, null]
    schemaVersion.value = v2DraftResult ? 2 : legacyDraftResult ? 1 : v2CommittedResult?.snapshot ? 2 : 1
    const selectedDraft = schemaVersion.value === 2 ? v2DraftResult : legacyDraftResult
    const selectedCommitted = schemaVersion.value === 2 ? v2CommittedResult : legacyCommittedResult
    committed.value = selectedCommitted?.snapshot?.projected.definition ?? null
    draft.value = selectedDraft
    editing.value = selectedDraft !== null
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function openDraft() {
  loading.value = true
  error.value = null
  try {
    draft.value = await userApi().openDraft() as Draft
    editing.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function replaceSnapshot(nextPacks: readonly Pack[]) {
  const current = draft.value
  if (!current) return
  loading.value = true
  error.value = null
  try {
    draft.value = await userApi().replaceDraft({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, snapshot: draftSnapshot(nextPacks), notes: current.notes }) as Draft
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function updateRule(ruleId: string, update: Partial<Pick<Rule, 'label' | 'priority' | 'configured'>>) {
  const next = packs().map((pack) => Object.freeze({ ...pack, rules: Object.freeze(pack.rules.map((rule) =>
    rule.ruleId === ruleId ? Object.freeze({ ...rule, ...update }) : rule)) }))
  await replaceSnapshot(next)
}

async function updatePack(packId: string, update: Partial<Pick<Pack, 'displayName' | 'priority' | 'mode' | 'target'>>) {
  const next = packs().map((pack) => pack.packId === packId ? Object.freeze({ ...pack, ...update }) : pack)
  await replaceSnapshot(next)
}

async function deleteRule(ruleId: string) {
  if (pendingRuleDelete.value !== ruleId) { pendingRuleDelete.value = ruleId; return }
  const current = draft.value
  if (!current) return
  const next = packs().map((pack) => Object.freeze({ ...pack,
    rules: Object.freeze(pack.rules.filter((rule) => rule.ruleId !== ruleId)) }))
  const notes = current.notes.filter((note) => note.ruleId !== ruleId)
  loading.value = true
  error.value = null
  try {
    draft.value = await userApi().replaceDraft({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, snapshot: draftSnapshot(next), notes }) as Draft
    pendingRuleDelete.value = null
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function deletePack(packId: string) {
  if (pendingPackDelete.value !== packId) { pendingPackDelete.value = packId; return }
  await replaceSnapshot(packs().filter((pack) => pack.packId !== packId))
  pendingPackDelete.value = null
}

async function moveRule(ruleId: string, targetPackId: string) {
  const source = packs().find((pack) => pack.rules.some((rule) => rule.ruleId === ruleId))
  const rule = source?.rules.find((entry) => entry.ruleId === ruleId)
  if (!source || !rule || source.packId === targetPackId) { moveRuleId.value = null; return }
  const next = packs().map((pack) => {
    if (pack.packId === source.packId) return Object.freeze({ ...pack,
      rules: Object.freeze(pack.rules.filter((entry) => entry.ruleId !== ruleId)) })
    if (pack.packId === targetPackId) return Object.freeze({ ...pack, rules: Object.freeze([...pack.rules, rule]) })
    return pack
  })
  await replaceSnapshot(next)
  moveRuleId.value = null
}

async function rewritePack(packId: string) {
  const current = draft.value
  if (!current) return
  loading.value = true
  error.value = null
  try {
    draft.value = await userApi().rewritePack({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, packId }) as Draft
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function exportPack(packId: string) {
  if (editing.value && draft.value?.dirty) return
  error.value = null
  try {
    const transfer = decodeUserRulePackTransferV2(await userApi().exportCommittedPack({ packId }))
    const blob = new Blob([JSON.stringify(transfer, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${packId}.starverse-rule-pack.json`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}

async function importPackFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  const current = draft.value
  if (!file) return
  error.value = null
  const priorSchemaVersion = schemaVersion.value
  let openedForImport: Draft | null = null
  let createdTargetDraft = false
  try {
    const transfer = JSON.parse(await file.text()) as unknown
    const envelope = transfer && typeof transfer === 'object' && !Array.isArray(transfer)
      ? transfer as Record<string, unknown> : null
    const targetSchemaVersion = schemaVersion.value === 2 || envelope?.schemaVersion === 2
      ? 2 : schemaVersion.value
    if (targetSchemaVersion !== schemaVersion.value || !current) {
      schemaVersion.value = targetSchemaVersion
      const targetApi = userApi()
      const priorDraft = await targetApi.readDraft() as Draft | null
      openedForImport = priorDraft ?? await targetApi.openDraft() as Draft
      createdTargetDraft = priorDraft === null
    } else openedForImport = current
    draft.value = await userApi().importPack({ sessionId: openedForImport.sessionId,
      expectedDraftRevision: openedForImport.draftRevision, transfer }) as Draft
    editing.value = true
  } catch (cause) {
    if (createdTargetDraft && openedForImport) {
      try {
        await userApi().cancelDraft({ sessionId: openedForImport.sessionId,
          expectedDraftRevision: openedForImport.draftRevision })
      } catch { /* The source V1 draft remains intact; reload below selects the surviving session. */ }
    }
    schemaVersion.value = priorSchemaVersion
    error.value = cause instanceof Error ? cause.message : String(cause)
    if (createdTargetDraft) {
      try {
        const sourceApi = priorSchemaVersion === 2 ? bridgeV2() : bridge()
        draft.value = sourceApi ? await sourceApi.readDraft() as Draft | null : current
        if (!draft.value && current) draft.value = current
        editing.value = draft.value !== null
      } catch { draft.value = current; editing.value = current !== null }
    }
  }
  finally { (event.target as HTMLInputElement).value = '' }
}

async function addRule() {
  const current = draft.value
  if (!current) return
  const form = addForm.value
  if (!form.ruleId || !form.providerAuthorityId || !form.endpointProfileId || !form.nativeModelId) {
    error.value = 'GENERATION_V2_USER_CAPABILITY_RULES_FORM_INVALID'
    return
  }
  loading.value = true
  error.value = null
  try {
    const targetPackId = form.packId || selectedPackId.value || null
    const legacyRule = { ruleId: form.ruleId, label: null, description: null, priority: 0, configured: 'default',
      providerAuthorityId: form.providerAuthorityId, endpointProfileId: form.endpointProfileId,
      selector: { kind: 'exact', nativeModelIds: [form.nativeModelId] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: form.support } }, evidence: null }
    draft.value = await userApi().addRule({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, targetPackId,
      firstPack: { packId: form.packId || 'user-pack-default', displayName: form.packDisplayName || t('settings.modelsCapabilities.defaultUserPack') },
      rule: schemaVersion.value === 2 ? migrateCapabilityRuleCoreRuleV1ToV2(legacyRule) : legacyRule,
      note: null }) as Draft
    addRuleOpen.value = false
    addForm.value = { packId: '', packDisplayName: '', ruleId: '', providerAuthorityId: '', endpointProfileId: '', nativeModelId: '', support: 'supported' }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function save() {
  const current = draft.value
  if (!current) return
  saving.value = true
  error.value = null
  try {
    await userApi().saveDraft({ sessionId: current.sessionId, expectedDraftRevision: current.draftRevision })
    editing.value = false
    draft.value = null
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { saving.value = false }
}

async function cancel() {
  const current = draft.value
  if (!current) return
  loading.value = true
  error.value = null
  try {
    await userApi().cancelDraft({ sessionId: current.sessionId, expectedDraftRevision: current.draftRevision })
    editing.value = false
    draft.value = null
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="capability-rules-user-overview">
    <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.userTitle') }}</h3>
        <p class="sv-meta mt-1">{{ t('settings.modelsCapabilities.userDescription') }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <button v-if="!editing" type="button" class="sv-btn sv-btn-sm" :disabled="loading" @click="openDraft">{{ t('settings.modelsCapabilities.editRules') }}</button>
        <label v-if="editing" class="sv-btn sv-btn-sm cursor-pointer" :class="{ 'pointer-events-none opacity-50': loading || saving }">
          {{ t('settings.modelsCapabilities.importPack') }}
          <input class="hidden" type="file" accept="application/json,.json" :disabled="loading || saving" @change="importPackFile" />
        </label>
        <button v-if="editing" type="button" class="sv-btn sv-btn-sm" :disabled="loading || saving" @click="cancel">{{ t('settings.modelsCapabilities.cancelChanges') }}</button>
        <button v-if="editing" type="button" class="sv-btn sv-btn-sm sv-btn-primary min-w-20" :disabled="loading || saving || !draft?.dirty" @click="save">{{ saving ? t('common.loading') : t('settings.modelsCapabilities.saveChanges') }}</button>
      </div>
    </header>
    <div v-if="draft && editing" class="flex flex-col gap-0.5 text-xs text-gray-600">
      <p v-if="draft?.dirty && editing" class="flex items-center gap-1.5 text-gray-900"><UiIcon name="info" :size="14" class="shrink-0" />{{ t('settings.modelsCapabilities.draftDirty') }}</p>
      <p v-if="draft && editing" class="sv-meta">{{ t('settings.modelsCapabilities.draftSession') }}: {{ draft.draftRevision }}</p>
    </div>
    <p v-if="error" class="sv-notice sv-notice-danger break-all"><UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" /><span class="min-w-0">{{ error }}</span></p>

    <div v-if="editing" class="flex flex-col gap-3">
      <div>
        <button type="button" class="sv-btn sv-btn-sm" :aria-expanded="addRuleOpen" @click="addRuleOpen = !addRuleOpen"><UiIcon name="plus" :size="14" />{{ t('settings.modelsCapabilities.addRule') }}</button>
      </div>
      <form v-if="addRuleOpen" class="grid gap-2 md:grid-cols-2" @submit.prevent="addRule">
        <input v-model="addForm.ruleId" required class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.ruleId')" />
        <input v-model="addForm.packId" class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.packId')" />
        <input v-model="addForm.packDisplayName" class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.packName')" />
        <input v-model="addForm.providerAuthorityId" required class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.providerAuthority')" />
        <input v-model="addForm.endpointProfileId" required class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.endpointProfile')" />
        <input v-model="addForm.nativeModelId" required class="sv-input sv-input-sm min-w-0" :placeholder="t('settings.modelsCapabilities.nativeModelId')" />
        <label class="flex items-center gap-2 text-xs text-gray-700"><span>{{ t('settings.modelsCapabilities.supportAssertion') }}</span><select v-model="addForm.support" class="sv-select sv-select-sm"><option value="supported">{{ t('common.enabled') }}</option><option value="unsupported">{{ t('common.disabled') }}</option></select></label>
        <div class="flex justify-end md:justify-start"><button type="submit" class="sv-btn sv-btn-sm sv-btn-primary">{{ t('settings.modelsCapabilities.addRule') }}</button></div>
      </form>
    </div>

    <nav v-if="selectedPack()" class="sv-divider-t flex flex-wrap items-center gap-1 pt-4 text-xs text-gray-500" aria-label="Rule navigation">
      <button type="button" class="rounded px-1 text-gray-700 hover:bg-[var(--sv-hover)] hover:text-gray-900" @click="backToPacks">{{ t('settings.modelsCapabilities.packs') }}</button>
      <UiIcon name="chevronRight" :size="12" />
      <button v-if="selectedRule()" type="button" class="rounded px-1 text-gray-700 hover:bg-[var(--sv-hover)] hover:text-gray-900" @click="backToRules">{{ selectedPack()?.displayName }}</button>
      <template v-if="selectedRule()"><UiIcon name="chevronRight" :size="12" /><span class="px-1 text-gray-900">{{ selectedRule()?.label ?? selectedRule()?.ruleId }}</span></template>
      <span v-else class="px-1 text-gray-900">{{ selectedPack()?.displayName }}</span>
    </nav>

    <div v-if="!selectedPack()">
      <ul class="flex flex-col">
        <li v-for="pack in packs()" :key="pack.packId" class="sv-divider-t first:border-t-0">
          <button type="button" class="sv-row flex w-full items-center gap-3 px-2 py-2.5 text-left" @click="showPack(pack.packId)">
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center justify-between gap-x-2 text-[13px]">
                <span class="min-w-0 break-words font-medium text-gray-900">{{ pack.displayName }}</span>
                <span class="sv-meta shrink-0">{{ t('settings.modelsCapabilities.priority') }}: {{ pack.priority }}</span>
              </span>
              <span class="sv-meta mt-0.5 block">{{ pack.rules.length }} {{ t('settings.modelsCapabilities.rules') }} · {{ pack.mode }} · {{ pack.target }}</span>
            </span>
            <UiIcon name="chevronRight" :size="14" class="shrink-0 text-gray-400" />
          </button>
        </li>
        <li v-if="!loading && packs().length === 0" class="sv-meta py-4">{{ t('settings.modelsCapabilities.noPacks') }}</li>
      </ul>
    </div>

    <template v-else-if="!selectedRule()">
      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs">
          <input v-if="editing" :value="selectedPack()!.displayName" class="sv-input sv-input-sm min-w-0 flex-1 font-medium" @change="updatePack(selectedPack()!.packId, { displayName: ($event.target as HTMLInputElement).value })" />
          <span v-else class="min-w-0 break-words text-[13px] font-medium text-gray-900">{{ selectedPack()!.displayName }}</span>
          <span class="flex items-center gap-2 text-gray-500">{{ t('settings.modelsCapabilities.priority') }}:
            <input v-if="editing" :value="selectedPack()!.priority" type="number" class="sv-input sv-input-sm w-20" @change="updatePack(selectedPack()!.packId, { priority: Number(($event.target as HTMLInputElement).value) })" />
            <span v-else>{{ selectedPack()!.priority }}</span>
          </span>
          <button v-if="!editing || !draft?.dirty" type="button" class="sv-btn sv-btn-sm" @click="exportPack(selectedPack()!.packId)">{{ t('settings.modelsCapabilities.exportPack') }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
          <label class="flex items-center gap-1.5">{{ t('settings.modelsCapabilities.packModeLabel') }} <select v-if="editing" :value="selectedPack()!.mode" class="sv-select sv-select-sm" @change="updatePack(selectedPack()!.packId, { mode: ($event.target as HTMLSelectElement).value as PackMode })"><option value="override">override</option><option value="default_only">default_only</option><option value="no_control">no_control</option></select><span v-else>{{ selectedPack()!.mode }}</span></label>
          <label class="flex items-center gap-1.5">{{ t('settings.modelsCapabilities.packTargetLabel') }} <select v-if="editing" :value="selectedPack()!.target" class="sv-select sv-select-sm" @change="updatePack(selectedPack()!.packId, { target: ($event.target as HTMLSelectElement).value as PackTarget })"><option value="enabled">enabled</option><option value="disabled">disabled</option></select><span v-else>{{ selectedPack()!.target }}</span></label>
          <button v-if="editing && selectedPack()!.mode !== 'no_control'" type="button" class="sv-btn sv-btn-sm" @click="rewritePack(selectedPack()!.packId)">{{ t('settings.modelsCapabilities.rewritePack') }}</button>
          <button v-if="editing" type="button" class="sv-btn sv-btn-sm sv-btn-danger min-w-20" @click="deletePack(selectedPack()!.packId)">{{ pendingPackDelete === selectedPack()!.packId ? t('settings.modelsCapabilities.confirmDelete') : t('common.delete') }}</button>
        </div>
      </section>
      <ul class="flex flex-col">
        <li v-for="rule in selectedPack()!.rules" :key="rule.ruleId" class="sv-divider-t first:border-t-0">
          <button type="button" class="sv-row flex w-full items-center gap-3 px-2 py-2.5 text-left text-xs text-gray-500" @click="showRule(rule.ruleId)">
            <span class="min-w-0 flex-1 break-words"><span class="text-[13px] font-medium text-gray-900">{{ rule.label ?? rule.ruleId }}</span> · {{ ruleEffectPath(rule) }} · {{ t('settings.modelsCapabilities.priority') }}: {{ rule.priority }} · {{ rule.configured }}</span>
            <UiIcon name="chevronRight" :size="14" class="shrink-0 text-gray-400" />
          </button>
        </li>
        <li v-if="selectedPack()!.rules.length === 0" class="sv-meta py-4">{{ t('settings.modelsCapabilities.noRules') }}</li>
      </ul>
    </template>

    <section v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h4 class="min-w-0 break-words text-sm font-semibold text-gray-900">{{ selectedRule()!.label ?? selectedRule()!.ruleId }}</h4>
        <div class="flex flex-wrap gap-2">
          <select v-if="editing" :value="selectedRule()!.configured" class="sv-select sv-select-sm" @change="updateRule(selectedRule()!.ruleId, { configured: ($event.target as HTMLSelectElement).value as Configured })"><option value="default">{{ t('settings.modelsCapabilities.activationDefault') }}</option><option value="on">{{ t('common.on') }}</option><option value="off">{{ t('common.off') }}</option></select>
          <button v-if="editing" type="button" class="sv-btn sv-btn-sm" :aria-expanded="moveRuleId === selectedRule()!.ruleId" @click="moveRuleId = moveRuleId === selectedRule()!.ruleId ? null : selectedRule()!.ruleId">{{ t('settings.modelsCapabilities.moveRule') }}</button>
          <button v-if="editing" type="button" class="sv-btn sv-btn-sm sv-btn-danger min-w-20" @click="deleteRule(selectedRule()!.ruleId)">{{ pendingRuleDelete === selectedRule()!.ruleId ? t('settings.modelsCapabilities.confirmDelete') : t('common.delete') }}</button>
        </div>
      </div>
      <div class="grid gap-2 text-xs text-gray-700">
        <label class="flex flex-wrap items-center gap-2">{{ t('settings.modelsCapabilities.ruleLabel') }} <input v-if="editing" :value="selectedRule()!.label ?? ''" class="sv-input sv-input-sm min-w-0 flex-1" @change="updateRule(selectedRule()!.ruleId, { label: ($event.target as HTMLInputElement).value || null })" /><span v-else>{{ selectedRule()!.label ?? selectedRule()!.ruleId }}</span></label>
        <label class="flex flex-wrap items-center gap-2">{{ t('settings.modelsCapabilities.priority') }} <input v-if="editing" :value="selectedRule()!.priority" type="number" class="sv-input sv-input-sm w-20" @change="updateRule(selectedRule()!.ruleId, { priority: Number(($event.target as HTMLInputElement).value) })" /><span v-else>{{ selectedRule()!.priority }}</span></label>
        <div>{{ t('settings.modelsCapabilities.assertionPath') }}: <span class="break-all font-mono">{{ ruleEffectPath(selectedRule()!) }}</span></div>
        <div v-if="schemaVersion === 2">{{ t('settings.modelsCapabilities.cloud.effect') }}: <span class="break-all font-mono">{{ ruleEffectText(selectedRule()!) }}</span></div>
        <div class="break-words">{{ t('settings.modelsCapabilities.selector') }}: <span class="font-mono">{{ selectedRule()!.selector.kind }}</span> · <span class="break-all">{{ selectorSummary(selectedRule()!) }}</span></div>
        <select v-if="editing && moveRuleId === selectedRule()!.ruleId" class="sv-select sv-select-sm max-w-full self-start" @change="moveRule(selectedRule()!.ruleId, ($event.target as HTMLSelectElement).value)"><option value="">{{ t('settings.modelsCapabilities.moveRule') }}</option><option v-for="target in packs().filter((item) => item.packId !== selectedPack()!.packId)" :key="target.packId" :value="target.packId">{{ target.displayName }}</option></select>
      </div>
    </section>
  </section>
</template>
