<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useProjectWorkspaceStore } from '../stores/projectWorkspaceStore'
import { useChatStore } from '../stores/chatStore'
import {
  PROJECT_STATUS_OPTIONS,
  type ProjectStatus,
  type ProjectPromptTemplate,
  type PromptTemplateLayer
} from '../services/projectPersistence'

type TemplateParameterForm = {
  key: string
  label: string
  defaultValue: string
}

type TemplateForm = {
  id: string
  name: string
  layer: PromptTemplateLayer
  description: string
  content: string
  parameters: TemplateParameterForm[]
}

const workspaceStore = useProjectWorkspaceStore()
const chatStore = useChatStore()

const workspace = computed(() => workspaceStore.currentWorkspace)
const isLoading = computed(() => workspaceStore.isCurrentProjectLoading)
const activeProjectId = computed(() => workspaceStore.activeProjectId)
const errorMessage = computed(() => {
  const id = activeProjectId.value
  return id ? workspaceStore.getError(id) : null
})

const goalDraft = ref('')
const statusDraft = ref<ProjectStatus>('exploring')
const tagsDraft = ref<string[]>([])
const newTag = ref('')

const saveMessage = ref('')
const pendingSaveOps = ref(0)
const isSaving = computed(() => pendingSaveOps.value > 0)

const promptTemplates = ref<ProjectPromptTemplate[]>([])
const quickStartIds = ref<string[]>([])
const selectedQuickStartToAdd = ref('')

const templateEditorVisible = ref(false)
const templateEditorError = ref('')
const editingTemplateId = ref<string | null>(null)
const templateDraft = ref<TemplateForm>(createEmptyTemplateDraft())

const parameterLaunchVisible = ref(false)
const launchParameterTemplate = ref<ProjectPromptTemplate | null>(null)
const launchParameterValues = ref<Record<string, string>>({})

const statusLabelMap: Record<ProjectStatus, string> = {
  exploring: '探索中',
  active: '进行中',
  stabilized: '已稳定',
  archived: '已归档'
}

const statusOptions = PROJECT_STATUS_OPTIONS.map(value => ({
  value,
  label: statusLabelMap[value]
}))

const runWithSaving = async (task: () => Promise<void>) => {
  pendingSaveOps.value += 1
  try {
    await task()
  } finally {
    pendingSaveOps.value -= 1
  }
}

const showTemporaryMessage = (text: string) => {
  saveMessage.value = text
  setTimeout(() => {
    if (saveMessage.value === text) {
      saveMessage.value = ''
    }
  }, 2000)
}

function createEmptyTemplateDraft(): TemplateForm {
  return {
    id: uuidv4(),
    name: '',
    layer: 'mode',
    description: '',
    content: '',
    parameters: []
  }
}

watch(
  workspace,
  next => {
    if (!next) {
      goalDraft.value = ''
      statusDraft.value = 'exploring'
      tagsDraft.value = []
      newTag.value = ''
      promptTemplates.value = []
      quickStartIds.value = []
      templateEditorVisible.value = false
      templateEditorError.value = ''
      return
    }

    goalDraft.value = next.overview.goal
    statusDraft.value = next.overview.status
    tagsDraft.value = [...next.overview.tags]
    newTag.value = ''

    promptTemplates.value = next.promptTemplates ? [...next.promptTemplates] : []
    quickStartIds.value = Array.isArray(next.homepage?.quickStartPromptIds)
      ? [...next.homepage.quickStartPromptIds]
      : []

    templateEditorVisible.value = false
    templateEditorError.value = ''
    parameterLaunchVisible.value = false
    launchParameterTemplate.value = null
    launchParameterValues.value = {}
    parameterLaunchVisible.value = false
    launchParameterTemplate.value = null
    launchParameterValues.value = {}
  },
  { immediate: true }
)

const promptTemplatesMap = computed(() => {
  const map = new Map<string, ProjectPromptTemplate>()
  for (const template of promptTemplates.value) {
    map.set(template.id, template)
  }
  return map
})

const quickStartTemplates = computed(() =>
  quickStartIds.value
    .map(id => promptTemplatesMap.value.get(id))
    .filter((template): template is ProjectPromptTemplate => Boolean(template))
)

const availableTemplatesForQuickStart = computed(() =>
  promptTemplates.value.filter(template => !quickStartIds.value.includes(template.id))
)

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildTemplateContent = (template: ProjectPromptTemplate, values: Record<string, string>) => {
  let content = template.content
  if (template.parameters && template.parameters.length > 0) {
    for (const param of template.parameters) {
      const key = param.key
      const replacement = values[key] ?? param.defaultValue ?? ''
      const regex = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g')
      content = content.replace(regex, replacement)
    }
  }
  return content
}

const formatTemplateUsage = (template: ProjectPromptTemplate) => {
  const count = template.useCount ?? 0
  if (count === 0) {
    return '尚未使用'
  }
  const lastUsed = template.lastUsedAt ? formatTimestamp(template.lastUsedAt) : '未知时间'
  return `已使用 ${count} 次 · 上次 ${lastUsed}`
}

const persistOverview = async (patch: Partial<{ goal: string; status: ProjectStatus; tags: string[] }>) => {
  const projectId = activeProjectId.value
  if (!projectId) {
    return
  }

  await runWithSaving(async () => {
    await workspaceStore.updateProjectOverview(projectId, patch)
    showTemporaryMessage('项目概览已保存')
  })
}

const persistPromptTemplates = async (
  templates: ProjectPromptTemplate[],
  options: { silent?: boolean } = {}
) => {
  const projectId = activeProjectId.value
  if (!projectId) {
    return
  }

  promptTemplates.value = [...templates]
  await runWithSaving(async () => {
    await workspaceStore.savePromptTemplates(projectId, templates)
    if (!options.silent) {
      showTemporaryMessage('提示词模板已保存')
    }
  })
}

const persistQuickStartIds = async (ids: string[]) => {
  const projectId = activeProjectId.value
  if (!projectId) {
    return
  }

  quickStartIds.value = [...ids]
  await runWithSaving(async () => {
    await workspaceStore.updateHomepageConfig(projectId, { quickStartPromptIds: ids })
    showTemporaryMessage('Quick Start 已更新')
  })
}

const handleGoalBlur = () => {
  persistOverview({ goal: goalDraft.value })
}

const handleStatusChange = () => {
  persistOverview({ status: statusDraft.value })
}

const handleAddTag = () => {
  const value = newTag.value.trim()
  if (!value) {
    return
  }
  if (tagsDraft.value.includes(value)) {
    newTag.value = ''
    return
  }

  const next = [...tagsDraft.value, value]
  tagsDraft.value = next
  newTag.value = ''
  persistOverview({ tags: next })
}

const handleTagEnter = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleAddTag()
  }
}

const removeTag = (target: string) => {
  const next = tagsDraft.value.filter(tag => tag !== target)
  tagsDraft.value = next
  persistOverview({ tags: next })
}

const startCreateTemplate = () => {
  editingTemplateId.value = null
  templateDraft.value = createEmptyTemplateDraft()
  templateEditorError.value = ''
  templateEditorVisible.value = true
}

const startEditTemplate = (template: ProjectPromptTemplate) => {
  editingTemplateId.value = template.id
  templateDraft.value = {
    id: template.id,
    name: template.name,
    layer: template.layer,
    description: template.description ?? '',
    content: template.content,
    parameters: template.parameters
      ? template.parameters.map(param => ({
          key: param.key,
          label: param.label ?? param.key,
          defaultValue: param.defaultValue ?? ''
        }))
      : []
  }
  templateEditorError.value = ''
  templateEditorVisible.value = true
}

const cancelTemplateEdit = () => {
  templateEditorVisible.value = false
  templateEditorError.value = ''
}

const addTemplateParameter = () => {
  templateDraft.value.parameters.push({
    key: '',
    label: '',
    defaultValue: ''
  })
}

const removeTemplateParameter = (index: number) => {
  templateDraft.value.parameters.splice(index, 1)
}

const handleSaveTemplate = async () => {
  const draft = templateDraft.value
  if (!draft.name.trim()) {
    templateEditorError.value = '请输入模板名称'
    return
  }
  if (!draft.content.trim()) {
    templateEditorError.value = '请输入提示词内容'
    return
  }

  const now = Date.now()
  const normalized: ProjectPromptTemplate = {
    id: draft.id,
    name: draft.name.trim(),
    layer: draft.layer,
    description: draft.description.trim() ? draft.description.trim() : undefined,
    content: draft.content,
    createdAt: editingTemplateId.value
      ? promptTemplatesMap.value.get(draft.id)?.createdAt ?? now
      : now,
    updatedAt: now
  }

  const normalizedParameters = (draft.parameters ?? [])
    .map(param => {
      const key = param.key.trim()
      if (!key) {
        return null
      }
      return {
        key,
        label: param.label.trim() ? param.label.trim() : key,
        defaultValue: param.defaultValue ?? ''
      }
    })
    .filter((param): param is NonNullable<typeof param> => Boolean(param))

  if (normalizedParameters.length > 0) {
    normalized.parameters = normalizedParameters
  } else {
    delete normalized.parameters
  }

  let nextTemplates: ProjectPromptTemplate[]
  if (editingTemplateId.value) {
    nextTemplates = promptTemplates.value.map(template =>
      template.id === draft.id ? normalized : template
    )
  } else {
    nextTemplates = [...promptTemplates.value, normalized]
  }

  await persistPromptTemplates(nextTemplates)
  templateEditorVisible.value = false
  templateEditorError.value = ''
}

const handleDeleteTemplate = async (templateId: string) => {
  const nextTemplates = promptTemplates.value.filter(template => template.id !== templateId)
  await persistPromptTemplates(nextTemplates)

  if (quickStartIds.value.includes(templateId)) {
    const nextQuickStarts = quickStartIds.value.filter(id => id !== templateId)
    await persistQuickStartIds(nextQuickStarts)
  }
}

const handleAddQuickStartTemplate = async () => {
  const templateId = selectedQuickStartToAdd.value
  if (!templateId || quickStartIds.value.includes(templateId)) {
    selectedQuickStartToAdd.value = ''
    return
  }

  const next = [...quickStartIds.value, templateId]
  selectedQuickStartToAdd.value = ''
  await persistQuickStartIds(next)
}

const removeQuickStartTemplate = async (templateId: string) => {
  if (!quickStartIds.value.includes(templateId)) {
    return
  }

  const next = quickStartIds.value.filter(id => id !== templateId)
  await persistQuickStartIds(next)
}

const moveQuickStartTemplate = async (index: number, direction: -1 | 1) => {
  const ids = [...quickStartIds.value]
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= ids.length) {
    return
  }

  const [item] = ids.splice(index, 1)
  ids.splice(targetIndex, 0, item)
  await persistQuickStartIds(ids)
}

const startQuickStartConversation = (template: ProjectPromptTemplate, params: Record<string, string> = {}) => {
  const conversationId = chatStore.createNewConversation(template.name || '快速开局')
  if (template.content) {
    const resolvedContent = buildTemplateContent(template, params)
    chatStore.updateConversationDraft({
      conversationId,
      draftText: resolvedContent
    })
  }

  if (activeProjectId.value && activeProjectId.value !== 'unassigned') {
    chatStore.assignConversationToProject(conversationId, activeProjectId.value)
  }

  chatStore.openConversationInTab(conversationId)

  recordTemplateUsage(template.id)
}

const recordTemplateUsage = async (templateId: string) => {
  const template = promptTemplatesMap.value.get(templateId)
  if (!template) {
    return
  }
  const now = Date.now()
  const updatedTemplate: ProjectPromptTemplate = {
    ...template,
    useCount: (template.useCount ?? 0) + 1,
    lastUsedAt: now,
    updatedAt: now
  }
  const nextTemplates = promptTemplates.value.map(item =>
    item.id === templateId ? updatedTemplate : item
  )
  await persistPromptTemplates(nextTemplates, { silent: true })
}

const handleQuickStart = (template: ProjectPromptTemplate) => {
  if (template.parameters && template.parameters.length > 0) {
    const initialValues: Record<string, string> = {}
    for (const param of template.parameters) {
      initialValues[param.key] = param.defaultValue ?? ''
    }
    launchParameterTemplate.value = template
    launchParameterValues.value = initialValues
    parameterLaunchVisible.value = true
  } else {
    startQuickStartConversation(template)
  }
}

const cancelQuickStartParameters = () => {
  parameterLaunchVisible.value = false
  launchParameterTemplate.value = null
  launchParameterValues.value = {}
}

const confirmQuickStartParameters = () => {
  if (!launchParameterTemplate.value) {
    return
  }
  startQuickStartConversation(launchParameterTemplate.value, { ...launchParameterValues.value })
  cancelQuickStartParameters()
}

const formatTimestamp = (value: number) => {
  if (!value) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return new Date(value).toLocaleString()
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-[radial-gradient(circle_at_top,_#eef2ff,_#f9fafb)]">
    <div class="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div class="flex items-start justify-between gap-6">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-indigo-500">项目工作台</p>
          <h1 class="mt-1 text-3xl font-semibold text-gray-900">
            {{ workspace?.name ?? '未选择项目' }}
          </h1>
          <p v-if="workspace" class="mt-1 text-sm text-gray-500">
            最近更新于 {{ formatTimestamp(workspace.updatedAt) }}
          </p>
        </div>

        <div class="flex flex-col items-end text-sm text-gray-500">
          <span v-if="isSaving" class="inline-flex items-center text-indigo-600">
            <svg class="w-4 h-4 mr-1 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            保存中...
          </span>
          <span v-else-if="saveMessage" class="text-gray-600">
            {{ saveMessage }}
          </span>
          <span v-if="errorMessage" class="mt-1 text-red-500">
            {{ errorMessage }}
          </span>
        </div>
      </div>

      <div v-if="isLoading" class="flex items-center justify-center py-24">
        <div class="flex items-center text-gray-500 text-sm">
          <svg class="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          载入项目数据
        </div>
      </div>

      <div v-else-if="!workspace" class="py-32 text-center text-gray-500">
        从左侧选择一个项目以查看项目主页。
      </div>

      <div v-else class="space-y-6">
        <section class="grid gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-indigo-50 p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold text-gray-900">项目概览</h2>
                <p class="text-sm text-gray-500">在右侧输入项目目标、状态与标签，方便全局引用。</p>
              </div>
              <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                :class="{
                  'bg-indigo-100 text-indigo-700': statusDraft === 'exploring' || statusDraft === 'active',
                  'bg-emerald-100 text-emerald-700': statusDraft === 'stabilized',
                  'bg-gray-200 text-gray-600': statusDraft === 'archived'
                }"
              >
                {{ statusLabelMap[statusDraft] }}
              </span>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">项目目标</label>
              <textarea
                v-model="goalDraft"
                @blur="handleGoalBlur"
                rows="4"
                placeholder="描述这个项目希望达成的目标、范围或重要背景..."
                class="w-full rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-400 text-sm p-3 resize-none bg-gray-50/70"
              />
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-indigo-50 p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">状态</label>
              <select
                v-model="statusDraft"
                @change="handleStatusChange"
                class="w-full rounded-xl border border-gray-200 bg-gray-50/70 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm px-3 py-2"
              >
                <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">标签</label>
              <div class="flex flex-wrap gap-2 mb-3">
                <span
                  v-for="tag in tagsDraft"
                  :key="tag"
                  class="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium"
                >
                  {{ tag }}
                  <button
                    class="ml-2 text-indigo-500 hover:text-indigo-700"
                    type="button"
                    @click="removeTag(tag)"
                  >
                    ×
                  </button>
                </span>
                <span v-if="tagsDraft.length === 0" class="text-sm text-gray-400">还没有标签</span>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="newTag"
                  @keydown="handleTagEnter"
                  type="text"
                  placeholder="输入标签后回车"
                  class="flex-1 rounded-xl border border-gray-200 bg-gray-50/70 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm px-3 py-2"
                />
                <button
                  type="button"
                  class="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition"
                  @click="handleAddTag"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-6 lg:grid-cols-2">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold text-gray-900">快速开局</h3>
                <p class="text-sm text-gray-500">将常用的提示词模板加入 Quick Start，一键创建新对话。</p>
              </div>
            </div>

            <div v-if="quickStartTemplates.length" class="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                v-for="template in quickStartTemplates"
                :key="template.id"
                class="h-28 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow transition flex flex-col items-start justify-between px-4 py-3 bg-gradient-to-br from-white to-indigo-50/40"
                @click="handleQuickStart(template)"
              >
                <div class="text-left">
                  <p class="text-base font-semibold text-gray-900">{{ template.name }}</p>
                  <p class="text-xs text-gray-500 mt-1">
                    {{ template.description || '点击开始一个新对话' }}
                  </p>
                  <p class="text-[11px] text-gray-400 mt-1">
                    {{ formatTemplateUsage(template) }}
                  </p>
                </div>
                <span class="text-[11px] font-medium text-indigo-600">
                  {{ template.layer === 'mode' ? 'Mode 模板' : 'Base 模板' }}
                  <template v-if="template.parameters && template.parameters.length">
                    · 需要 {{ template.parameters.length }} 个参数
                  </template>
                </span>
              </button>
            </div>
            <div v-else class="mt-4 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
              还没有 Quick Start 模板。请在下方“提示词模板”中创建模板并加入列表。
            </div>

            <div class="mt-6 border-t border-gray-100 pt-4">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-gray-700">Quick Start 配置</h4>
              </div>
              <div v-if="quickStartIds.length" class="space-y-2">
                <div
                  v-for="(templateId, index) in quickStartIds"
                  :key="templateId"
                  class="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-3 py-2"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">
                      {{ promptTemplatesMap.get(templateId)?.name || '已删除的模板' }}
                    </p>
                    <p class="text-xs text-gray-500">
                      {{ promptTemplatesMap.get(templateId)?.layer === 'mode' ? 'Mode 模板' : 'Base 模板' }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                      @click="moveQuickStartTemplate(index, -1)"
                      :disabled="index === 0"
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                      @click="moveQuickStartTemplate(index, 1)"
                      :disabled="index === quickStartIds.length - 1"
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      class="text-xs text-red-500 hover:text-red-600"
                      @click="removeQuickStartTemplate(templateId)"
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="text-xs text-gray-500 pb-3">
                尚未添加任何 Quick Start 模板。
              </div>
              <div class="mt-3 flex gap-2">
                <select
                  v-model="selectedQuickStartToAdd"
                  class="flex-1 text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">选择模板加入 Quick Start</option>
                  <option
                    v-for="template in availableTemplatesForQuickStart"
                    :key="template.id"
                    :value="template.id"
                  >
                    {{ template.name }}
                  </option>
                </select>
                <button
                  type="button"
                  class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition disabled:opacity-40"
                  :disabled="!selectedQuickStartToAdd || availableTemplatesForQuickStart.length === 0"
                  @click="handleAddQuickStartTemplate"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 class="text-base font-semibold text-gray-900">下一步</h3>
            <p class="mt-1 text-sm text-gray-500">这里将展示项目数据库、工作流与用量统计。当前阶段先提供概览提醒。</p>
            <ul class="mt-4 space-y-3 text-sm text-gray-600">
              <li class="flex items-center">
                <span class="w-2 h-2 rounded-full bg-indigo-400 mr-3"></span>
                Phase 2：接入 Project DB / Usage / Cluster schema。
              </li>
              <li class="flex items-center">
                <span class="w-2 h-2 rounded-full bg-indigo-400 mr-3"></span>
                Phase 3：提示词模板、快速开局按钮与数据库注入。
              </li>
              <li class="flex items-center">
                <span class="w-2 h-2 rounded-full bg-indigo-400 mr-3"></span>
                Phase 4：工作流、聚类看板与仪表盘。
              </li>
            </ul>
          </div>
        </section>

        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-semibold text-gray-900">提示词模板</h3>
              <p class="text-sm text-gray-500">通过模板统一提示词，Quick Start 与未来工作流都会复用这里的配置。</p>
            </div>
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition"
              @click="startCreateTemplate"
            >
              新建模板
            </button>
          </div>

          <div
            v-if="templateEditorVisible"
            class="border border-indigo-100 bg-indigo-50/40 rounded-2xl p-4 space-y-4"
          >
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">模板名称</label>
                <input
                  v-model="templateDraft.name"
                  type="text"
                  class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="例如：学术写作助手"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">层级</label>
                <select
                  v-model="templateDraft.layer"
                  class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="mode">Mode 模板（用于快速开局）</option>
                  <option value="base">Base 模板（基础提示）</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
              <input
                v-model="templateDraft.description"
                type="text"
                class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="一句话介绍该模板的用途"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">提示词内容</label>
              <textarea
                v-model="templateDraft.content"
                rows="6"
                class="w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="可以包含 {param} 占位符，稍后版本会支持参数填写。"
              />
            </div>

            <div class="border-t border-indigo-100 pt-3 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium text-gray-700">参数占位符</label>
                  <p class="text-xs text-gray-500">使用 {key} 在提示词中引用参数，启动前会提示填写。</p>
                </div>
                <button
                  type="button"
                  class="text-xs px-3 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
                  @click="addTemplateParameter"
                >
                  添加参数
                </button>
              </div>

              <div v-if="templateDraft.parameters.length === 0" class="text-xs text-gray-500">
                暂无参数，占位符为可选项。
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="(param, index) in templateDraft.parameters"
                  :key="index"
                  class="grid gap-2 md:grid-cols-3 items-start"
                >
                  <div>
                    <label class="text-xs font-medium text-gray-600 mb-1 block">参数 key</label>
                    <input
                      v-model="templateDraft.parameters[index].key"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="例如 objective"
                    />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-gray-600 mb-1 block">显示标签</label>
                    <input
                      v-model="templateDraft.parameters[index].label"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="例如 项目目标"
                    />
                  </div>
                  <div class="flex items-end gap-2">
                    <div class="flex-1">
                      <label class="text-xs font-medium text-gray-600 mb-1 block">默认值（可选）</label>
                      <input
                        v-model="templateDraft.parameters[index].defaultValue"
                        type="text"
                        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        placeholder="默认填充值"
                      />
                    </div>
                    <button
                      type="button"
                      class="text-xs text-red-500 hover:text-red-600 px-2 py-1"
                      @click="removeTemplateParameter(index)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="templateEditorError" class="text-sm text-red-600">
              {{ templateEditorError }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-white"
                @click="cancelTemplateEdit"
              >
                取消
              </button>
              <button
                type="button"
                class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition"
                @click="handleSaveTemplate"
              >
                保存模板
              </button>
            </div>
          </div>

          <div v-if="promptTemplates.length === 0" class="text-sm text-gray-500 border border-dashed border-gray-200 rounded-2xl p-6">
            暂无提示词模板，点击右上角“新建模板”即可开始配置。
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="template in promptTemplates"
              :key="template.id"
              class="border border-gray-200 rounded-2xl p-4 space-y-3"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-base font-semibold text-gray-900">{{ template.name }}</p>
                  <p class="text-xs text-gray-500">
                    {{ template.layer === 'mode' ? 'Mode 模板' : 'Base 模板' }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="text-xs text-indigo-600 hover:text-indigo-800"
                    @click="startEditTemplate(template)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="text-xs text-red-500 hover:text-red-600"
                    @click="handleDeleteTemplate(template.id)"
                  >
                    删除
                  </button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span>{{ template.layer === 'mode' ? 'Mode 模板' : 'Base 模板' }}</span>
                <span>{{ formatTemplateUsage(template) }}</span>
                <span v-if="template.parameters && template.parameters.length">
                  参数 {{ template.parameters.length }} 个
                </span>
              </div>
              <p v-if="template.description" class="text-sm text-gray-600">
                {{ template.description }}
              </p>
              <pre class="text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto text-gray-800 whitespace-pre-wrap">{{ template.content }}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <div
    v-if="parameterLaunchVisible && launchParameterTemplate"
    class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4"
    @click.self="cancelQuickStartParameters"
  >
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
      <div class="flex items-start justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">填写参数</h3>
          <p class="text-sm text-gray-500 mt-1">
            {{ launchParameterTemplate.name }} · 共 {{ launchParameterTemplate.parameters?.length || 0 }} 个参数
          </p>
        </div>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600"
          @click="cancelQuickStartParameters"
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div
          v-for="param in launchParameterTemplate.parameters"
          :key="param.key"
          class="space-y-1"
        >
          <label class="text-sm font-medium text-gray-700">
            {{ param.label || param.key }}
          </label>
          <input
            v-model="launchParameterValues[param.key]"
            type="text"
            class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            :placeholder="param.defaultValue || `请输入 ${param.label || param.key}`"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
          @click="cancelQuickStartParameters"
        >
          取消
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition"
          @click="confirmQuickStartParameters"
        >
          开始对话
        </button>
      </div>
    </div>
  </div>
</template>
