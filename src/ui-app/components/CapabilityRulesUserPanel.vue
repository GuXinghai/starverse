<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

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
  assertion: Readonly<{ path: string; value: unknown }>
  evidence: unknown
}>
type Pack = Readonly<{
  schemaVersion: 1
  packId: string
  displayName: string
  description: string | null
  priority: number
  mode: PackMode
  target: PackTarget
  rules: readonly Rule[]
}>
type Snapshot = Readonly<{ schemaVersion: 1; ownership: 'user'; ownerId: string; packs: readonly Pack[] }>
type Draft = Readonly<{
  sessionId: string
  draftRevision: number
  dirty: boolean
  projected: Readonly<{ definition: Snapshot }>
  notes: readonly Readonly<{ ruleId: string; note: string }>[]
}>

const draft = ref<Draft | null>(null)
const committed = ref<Snapshot | null>(null)
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
  return Object.freeze({ schemaVersion: 1, ownership: 'user', ownerId: base.projected.definition.ownerId,
    packs: Object.freeze([...packsValue]) })
}

function userApi() { return bridge() }

async function load() {
  loading.value = true
  error.value = null
  try {
    const [committedResult, draftResult] = await Promise.all([userApi().readCommitted(), userApi().readDraft()]) as [
      Readonly<{ snapshot: Readonly<{ projected: Readonly<{ definition: Snapshot }> }> | null }>, Draft | null,
    ]
    committed.value = committedResult.snapshot?.projected.definition ?? null
    draft.value = draftResult
    editing.value = draftResult !== null
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
    const transfer = await userApi().exportCommittedPack({ packId })
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
  if (!file || !current) return
  error.value = null
  try {
    const transfer = JSON.parse(await file.text()) as unknown
    draft.value = await userApi().importPack({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, transfer }) as Draft
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
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
    draft.value = await userApi().addRule({ sessionId: current.sessionId,
      expectedDraftRevision: current.draftRevision, targetPackId,
      firstPack: { packId: form.packId || 'user-pack-default', displayName: form.packDisplayName || t('settings.modelsCapabilities.defaultUserPack') },
      rule: { ruleId: form.ruleId, label: null, description: null, priority: 0, configured: 'default',
        providerAuthorityId: form.providerAuthorityId, endpointProfileId: form.endpointProfileId,
        selector: { kind: 'exact', nativeModelIds: [form.nativeModelId] },
        assertion: { path: 'reasoning.support', value: { kind: 'support', value: form.support } }, evidence: null },
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
  <section class="space-y-3" data-testid="capability-rules-user-overview">
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.userTitle') }}</h3>
        <p class="mt-1 text-xs text-gray-500">{{ t('settings.modelsCapabilities.userDescription') }}</p>
      </div>
      <div class="flex gap-2">
        <button v-if="!editing" type="button" class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" :disabled="loading" @click="openDraft">{{ t('settings.modelsCapabilities.editRules') }}</button>
        <label v-if="editing" class="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
          {{ t('settings.modelsCapabilities.importPack') }}
          <input class="hidden" type="file" accept="application/json,.json" :disabled="loading || saving" @change="importPackFile" />
        </label>
        <button v-if="editing" type="button" class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" :disabled="loading || saving" @click="cancel">{{ t('settings.modelsCapabilities.cancelChanges') }}</button>
        <button v-if="editing" type="button" class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700" :disabled="loading || saving || !draft?.dirty" @click="save">{{ saving ? t('common.loading') : t('settings.modelsCapabilities.saveChanges') }}</button>
      </div>
    </header>
    <p v-if="draft?.dirty && editing" class="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">{{ t('settings.modelsCapabilities.draftDirty') }}</p>
    <p v-if="draft && editing" class="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">{{ t('settings.modelsCapabilities.draftSession') }}: {{ draft.draftRevision }}</p>
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{{ error }}</p>

    <div v-if="editing" class="rounded border border-blue-200 bg-white p-3">
      <button type="button" class="rounded border border-blue-300 px-2 py-1 text-xs text-blue-800 hover:bg-blue-50" @click="addRuleOpen = !addRuleOpen">{{ t('settings.modelsCapabilities.addRule') }}</button>
      <form v-if="addRuleOpen" class="mt-3 grid gap-2 md:grid-cols-2" @submit.prevent="addRule">
        <input v-model="addForm.ruleId" required class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.ruleId')" />
        <input v-model="addForm.packId" class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.packId')" />
        <input v-model="addForm.packDisplayName" class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.packName')" />
        <input v-model="addForm.providerAuthorityId" required class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.providerAuthority')" />
        <input v-model="addForm.endpointProfileId" required class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.endpointProfile')" />
        <input v-model="addForm.nativeModelId" required class="rounded border border-gray-300 px-2 py-1 text-xs" :placeholder="t('settings.modelsCapabilities.nativeModelId')" />
        <label class="flex items-center gap-2 text-xs text-gray-700"><span>{{ t('settings.modelsCapabilities.supportAssertion') }}</span><select v-model="addForm.support" class="rounded border border-gray-300 px-2 py-1"><option value="supported">{{ t('common.enabled') }}</option><option value="unsupported">{{ t('common.disabled') }}</option></select></label>
        <button type="submit" class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">{{ t('settings.modelsCapabilities.addRule') }}</button>
      </form>
    </div>

    <nav v-if="selectedPack()" class="flex items-center gap-1 text-xs text-gray-500" aria-label="Rule navigation">
      <button type="button" class="text-blue-700 hover:underline" @click="backToPacks">{{ t('settings.modelsCapabilities.packs') }}</button>
      <span aria-hidden="true">/</span>
      <button v-if="selectedRule()" type="button" class="text-blue-700 hover:underline" @click="backToRules">{{ selectedPack()?.displayName }}</button>
      <template v-if="selectedRule()"><span aria-hidden="true">/</span><span>{{ selectedRule()?.label ?? selectedRule()?.ruleId }}</span></template>
      <span v-else>{{ selectedPack()?.displayName }}</span>
    </nav>

    <div v-if="!selectedPack()">
      <ul class="space-y-2">
        <li v-for="pack in packs()" :key="pack.packId">
          <button type="button" class="w-full rounded border border-gray-200 bg-white p-3 text-left hover:bg-gray-50" @click="showPack(pack.packId)">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="font-medium text-gray-900">{{ pack.displayName }}</span>
              <span class="text-gray-500">{{ t('settings.modelsCapabilities.priority') }}: {{ pack.priority }}</span>
            </div>
            <div class="mt-1 text-[11px] text-gray-500">{{ pack.rules.length }} {{ t('settings.modelsCapabilities.rules') }} · {{ pack.mode }} · {{ pack.target }}</div>
          </button>
        </li>
        <li v-if="!loading && packs().length === 0" class="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">{{ t('settings.modelsCapabilities.noPacks') }}</li>
      </ul>
    </div>

    <template v-else-if="!selectedRule()">
      <section class="rounded border border-gray-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <input v-if="editing" :value="selectedPack()!.displayName" class="min-w-0 rounded border border-gray-300 px-2 py-1 font-medium text-gray-900" @change="updatePack(selectedPack()!.packId, { displayName: ($event.target as HTMLInputElement).value })" />
          <span v-else class="font-medium text-gray-900">{{ selectedPack()!.displayName }}</span>
          <span class="flex items-center gap-2 text-gray-500">{{ t('settings.modelsCapabilities.priority') }}:
            <input v-if="editing" :value="selectedPack()!.priority" type="number" class="w-20 rounded border border-gray-300 px-1 py-0.5" @change="updatePack(selectedPack()!.packId, { priority: Number(($event.target as HTMLInputElement).value) })" />
            <span v-else>{{ selectedPack()!.priority }}</span>
          </span>
          <button v-if="!editing || !draft?.dirty" type="button" class="rounded border border-gray-300 px-1.5 py-0.5 text-gray-700" @click="exportPack(selectedPack()!.packId)">{{ t('settings.modelsCapabilities.exportPack') }}</button>
        </div>
        <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
          <label>{{ t('settings.modelsCapabilities.packModeLabel') }} <select v-if="editing" :value="selectedPack()!.mode" class="rounded border border-gray-300 px-1" @change="updatePack(selectedPack()!.packId, { mode: ($event.target as HTMLSelectElement).value as PackMode })"><option value="override">override</option><option value="default_only">default_only</option><option value="no_control">no_control</option></select><span v-else>{{ selectedPack()!.mode }}</span></label>
          <label>{{ t('settings.modelsCapabilities.packTargetLabel') }} <select v-if="editing" :value="selectedPack()!.target" class="rounded border border-gray-300 px-1" @change="updatePack(selectedPack()!.packId, { target: ($event.target as HTMLSelectElement).value as PackTarget })"><option value="enabled">enabled</option><option value="disabled">disabled</option></select><span v-else>{{ selectedPack()!.target }}</span></label>
          <button v-if="editing && selectedPack()!.mode !== 'no_control'" type="button" class="rounded border border-gray-300 px-1.5 py-0.5" @click="rewritePack(selectedPack()!.packId)">{{ t('settings.modelsCapabilities.rewritePack') }}</button>
          <button v-if="editing" type="button" class="rounded border border-red-300 px-1.5 py-0.5 text-red-700" @click="deletePack(selectedPack()!.packId)">{{ pendingPackDelete === selectedPack()!.packId ? t('settings.modelsCapabilities.confirmDelete') : t('common.delete') }}</button>
        </div>
      </section>
      <ul class="space-y-2">
        <li v-for="rule in selectedPack()!.rules" :key="rule.ruleId">
          <button type="button" class="w-full rounded border border-gray-200 bg-white p-3 text-left text-[11px] text-gray-700 hover:bg-gray-50" @click="showRule(rule.ruleId)">
            <span class="font-medium text-gray-900">{{ rule.label ?? rule.ruleId }}</span> · {{ rule.assertion.path }} · {{ t('settings.modelsCapabilities.priority') }}: {{ rule.priority }} · {{ rule.configured }}
          </button>
        </li>
        <li v-if="selectedPack()!.rules.length === 0" class="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">{{ t('settings.modelsCapabilities.noRules') }}</li>
      </ul>
    </template>

    <section v-else class="rounded border border-gray-200 bg-white p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-xs font-semibold text-gray-900">{{ selectedRule()!.label ?? selectedRule()!.ruleId }}</h4>
        <div class="flex flex-wrap gap-1">
          <select v-if="editing" :value="selectedRule()!.configured" class="rounded border border-gray-300 px-1 text-[11px]" @change="updateRule(selectedRule()!.ruleId, { configured: ($event.target as HTMLSelectElement).value as Configured })"><option value="default">{{ t('settings.modelsCapabilities.activationDefault') }}</option><option value="on">{{ t('common.on') }}</option><option value="off">{{ t('common.off') }}</option></select>
          <button v-if="editing" type="button" class="rounded border border-gray-300 px-1.5 py-0.5 text-[11px]" @click="moveRuleId = moveRuleId === selectedRule()!.ruleId ? null : selectedRule()!.ruleId">{{ t('settings.modelsCapabilities.moveRule') }}</button>
          <button v-if="editing" type="button" class="rounded border border-red-300 px-1.5 py-0.5 text-[11px] text-red-700" @click="deleteRule(selectedRule()!.ruleId)">{{ pendingRuleDelete === selectedRule()!.ruleId ? t('settings.modelsCapabilities.confirmDelete') : t('common.delete') }}</button>
        </div>
      </div>
      <div class="mt-3 grid gap-2 text-[11px] text-gray-700">
        <label>{{ t('settings.modelsCapabilities.ruleLabel') }} <input v-if="editing" :value="selectedRule()!.label ?? ''" class="ml-1 rounded border border-gray-300 px-1 py-0.5" @change="updateRule(selectedRule()!.ruleId, { label: ($event.target as HTMLInputElement).value || null })" /><span v-else>{{ selectedRule()!.label ?? selectedRule()!.ruleId }}</span></label>
        <label>{{ t('settings.modelsCapabilities.priority') }} <input v-if="editing" :value="selectedRule()!.priority" type="number" class="ml-1 w-20 rounded border border-gray-300 px-1 py-0.5" @change="updateRule(selectedRule()!.ruleId, { priority: Number(($event.target as HTMLInputElement).value) })" /><span v-else>{{ selectedRule()!.priority }}</span></label>
        <div>{{ t('settings.modelsCapabilities.assertionPath') }}: <span class="font-mono">{{ selectedRule()!.assertion.path }}</span></div>
        <div>{{ t('settings.modelsCapabilities.selector') }}: <span class="font-mono">{{ selectedRule()!.selector.kind }}</span> · {{ selectorSummary(selectedRule()!) }}</div>
        <select v-if="editing && moveRuleId === selectedRule()!.ruleId" class="rounded border border-gray-300 px-1 py-0.5" @change="moveRule(selectedRule()!.ruleId, ($event.target as HTMLSelectElement).value)"><option value="">{{ t('settings.modelsCapabilities.moveRule') }}</option><option v-for="target in packs().filter((item) => item.packId !== selectedPack()!.packId)" :key="target.packId" :value="target.packId">{{ target.displayName }}</option></select>
      </div>
    </section>
  </section>
</template>
