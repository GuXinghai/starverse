<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ComponentPublicInstance } from 'vue'
// @ts-ignore
import { useChatStore } from '../stores/chatStore'
import { runFulltextSearch, SearchDslError } from '../services/searchService'

type ConversationRecord = {
  id: string
  title: string
  projectId?: string | null
  model: string
  generationStatus: 'idle' | 'sending' | 'receiving'
  hasError?: boolean
  tree?: {
    branches?: Map<string, any> | Record<string, any>
    currentPath?: string[]
  }
}

type ProjectRecord = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  isSystem?: boolean
}

const chatStore = useChatStore()

// 编辑状态
const editingId = ref<string | null>(null)
const editingTitle = ref('')

// 删除确认状态
const deletingId = ref<string | null>(null)

// 搜索与过滤
const searchQuery = ref('')
const rawSearchQuery = computed(() => searchQuery.value.trim())
const normalizedQuery = computed(() => rawSearchQuery.value.toLowerCase())
const searchInTitle = ref(true)
const searchInContent = ref(false)
const contentSearchHits = ref<Set<string>>(new Set())
const contentSearchLoading = ref(false)
const contentSearchMessage = ref('')
type SearchMessageTone = 'info' | 'warning' | 'error'
const contentSearchMessageType = ref<SearchMessageTone>('info')
const contentSearchActive = computed(() => searchInContent.value && rawSearchQuery.value.length > 0)
const contentSearchMessageClass = computed(() => {
  switch (contentSearchMessageType.value) {
    case 'warning':
      return 'text-yellow-600'
    case 'error':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
})

// 项目管理
const projectFilter = ref<string>('all')
const isCreatingProject = ref(false)
const newProjectName = ref('')
const projectEditingId = ref<string | null>(null)
const projectEditingName = ref('')
const projectDeletingId = ref<string | null>(null)
const hoverMenuId = ref<string | null>(null)
const hoverOpenTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverProjectMenuId = ref<string | null>(null)
const hoverProjectOpenTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverProjectCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const newProjectInputRef = ref<HTMLInputElement | null>(null)

type Placement =
  | 'right-start' | 'right-end'
  | 'left-start' | 'left-end'
  | 'bottom-start' | 'bottom-end'
  | 'top-start' | 'top-end'

// ========== 菜单状态管理 ==========
// ⚠️ 重要：主菜单和子菜单都必须 Teleport 到 body 并使用 fixed 定位
// 原因：避免被父容器的 overflow 裁剪，确保始终浮在最上层
// 参考文档：docs/SUBMENU_TELEPORT_FIX.md

// 主菜单状态
const contextMenuRef = ref<HTMLElement | null>(null)
const activeAnchorEl = ref<HTMLElement | null>(null)
const lastKnownAnchorRect = ref<DOMRect | null>(null)
const transformOrigin = ref('top left')
const contextMenuCoords = ref({ x: 0, y: 0, maxW: 320, maxH: 360 })
let dprMediaQuery: MediaQueryList | null = null
let dprMediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null
let menuResizeObserver: ResizeObserver | null = null

const contextMenuStyle = computed(() => ({
  top: `${contextMenuCoords.value.y}px`,
  left: `${contextMenuCoords.value.x}px`,
  maxHeight: `${contextMenuCoords.value.maxH}px`,
  maxWidth: `${contextMenuCoords.value.maxW}px`,
  transformOrigin: transformOrigin.value
}))

// 子菜单（项目列表）状态
// ⚠️ 关键：子菜单必须独立 Teleport，不能嵌套在主菜单的 DOM 树内
// 否则会被主菜单的 overflow-auto 裁剪，且 z-index 受层叠上下文限制
const projectMenuRef = ref<HTMLElement | null>(null)
const projectMenuAnchorEl = ref<HTMLElement | null>(null)  // 追踪"移动到项目"按钮位置
const projectMenuTransformOrigin = ref('top left')
const projectMenuCoords = ref({ x: 0, y: 0, maxW: 176, maxH: 400 })
let projectMenuResizeObserver: ResizeObserver | null = null

const projectMenuStyle = computed(() => ({
  top: `${projectMenuCoords.value.y}px`,
  left: `${projectMenuCoords.value.x}px`,
  maxHeight: `${projectMenuCoords.value.maxH}px`,
  maxWidth: `${projectMenuCoords.value.maxW}px`,
  transformOrigin: projectMenuTransformOrigin.value
}))

const resolveHTMLElement = (value: Element | ComponentPublicInstance | null): HTMLElement | null => {
  if (!value) {
    return null
  }
  if (value instanceof HTMLElement) {
    return value
  }
  if ('$el' in (value as ComponentPublicInstance)) {
    const element = (value as ComponentPublicInstance).$el
    return element instanceof HTMLElement ? element : null
  }
  return null
}

const setContextMenuRef = (el: Element | ComponentPublicInstance | null) => {
  if (menuResizeObserver) {
    menuResizeObserver.disconnect()
    menuResizeObserver = null
  }

  const element = resolveHTMLElement(el)
  contextMenuRef.value = element

  if (element && typeof ResizeObserver !== 'undefined') {
    menuResizeObserver = new ResizeObserver(() => {
      updateContextMenuPosition()
    })
    menuResizeObserver.observe(element)
  }
}

// ⚠️ 子菜单 ref 设置：监听尺寸变化以动态调整位置
const setProjectMenuRef = (el: Element | ComponentPublicInstance | null) => {
  if (projectMenuResizeObserver) {
    projectMenuResizeObserver.disconnect()
    projectMenuResizeObserver = null
  }

  const element = resolveHTMLElement(el)
  projectMenuRef.value = element

  if (element && typeof ResizeObserver !== 'undefined') {
    projectMenuResizeObserver = new ResizeObserver(() => {
      updateProjectMenuPosition()
    })
    projectMenuResizeObserver.observe(element)
  }
}

// ⚠️ 锚点追踪：记录"移动到项目"按钮位置，用于计算子菜单坐标
const setProjectMenuAnchor = (el: HTMLElement | null) => {
  projectMenuAnchorEl.value = el
}

const detachDprMediaQuery = () => {
  if (!dprMediaQuery) {
    return
  }
  if (dprMediaQueryListener) {
    if (typeof dprMediaQuery.removeEventListener === 'function') {
      dprMediaQuery.removeEventListener('change', dprMediaQueryListener)
    } else if (typeof dprMediaQuery.removeListener === 'function') {
      dprMediaQuery.removeListener(dprMediaQueryListener)
    }
  }
  dprMediaQuery = null
  dprMediaQueryListener = null
}

const registerDprMediaQuery = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  detachDprMediaQuery()

  const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const handler = () => {
    recomputeContextMenuPosition()
    registerDprMediaQuery()
  }

  dprMediaQuery = mediaQuery
  dprMediaQueryListener = handler

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler)
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handler)
  }
}

// 格式化模型名称显示
const formatModelName = (modelName: string) => {
  const match = modelName.match(/gemini-[\d.]+-[\w]+/)
  if (match) {
    return match[0]
  }
  const parts = modelName.split('/')
  return parts[parts.length - 1]
}

const defaultPlacements: Placement[] = ['right-start', 'right-end', 'left-start', 'bottom-start', 'top-start']

const computeMenuPosition = (anchorRect: DOMRect, menuW: number, menuH: number, prefer: Placement[] = defaultPlacements) => {
  const PADDING = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const placements: Record<Placement, () => { x: number; y: number; origin: string }> = {
    'right-start': () => ({ x: anchorRect.right + PADDING, y: anchorRect.top, origin: 'top left' }),
    'right-end': () => ({ x: anchorRect.right + PADDING, y: anchorRect.bottom - menuH, origin: 'bottom left' }),
    'left-start': () => ({ x: anchorRect.left - PADDING - menuW, y: anchorRect.top, origin: 'top right' }),
    'left-end': () => ({ x: anchorRect.left - PADDING - menuW, y: anchorRect.bottom - menuH, origin: 'bottom right' }),
    'bottom-start': () => ({ x: anchorRect.left, y: anchorRect.bottom + PADDING, origin: 'top left' }),
    'bottom-end': () => ({ x: anchorRect.right - menuW, y: anchorRect.bottom + PADDING, origin: 'top right' }),
    'top-start': () => ({ x: anchorRect.left, y: anchorRect.top - PADDING - menuH, origin: 'bottom left' }),
    'top-end': () => ({ x: anchorRect.right - menuW, y: anchorRect.top - PADDING - menuH, origin: 'bottom right' })
  }

  const maxWidth = Math.max(160, viewportWidth - PADDING * 2)
  const maxHeight = Math.max(120, viewportHeight - PADDING * 2)

  for (const placement of prefer) {
    const resolver = placements[placement]
    if (!resolver) {
      continue
    }
    let { x, y, origin } = resolver()

    const maxX = Math.max(PADDING, viewportWidth - PADDING - menuW)
    const maxY = Math.max(PADDING, viewportHeight - PADDING - menuH)

    x = Math.min(Math.max(PADDING, x), maxX)
    y = Math.min(Math.max(PADDING, y), maxY)

    const overflow =
      x + menuW > viewportWidth - PADDING ||
      x < PADDING ||
      y + menuH > viewportHeight - PADDING ||
      y < PADDING

    if (!overflow) {
      return { x, y, origin, maxW: maxWidth, maxH: maxHeight }
    }
  }

  return {
    x: PADDING,
    y: PADDING,
    origin: 'top left',
    maxW: maxWidth,
    maxH: maxHeight
  }
}

const updateContextMenuPosition = (anchorRect?: DOMRect | null) => {
  if (!hoverMenuId.value) {
    return
  }
  const menuEl = contextMenuRef.value
  if (!menuEl) {
    return
  }
  const rect = anchorRect ?? activeAnchorEl.value?.getBoundingClientRect() ?? lastKnownAnchorRect.value
  if (!rect) {
    return
  }

  const { width: menuWidth, height: menuHeight } = menuEl.getBoundingClientRect()
  const { x, y, origin, maxW, maxH } = computeMenuPosition(rect, menuWidth, menuHeight)
  contextMenuCoords.value = { x, y, maxW, maxH }
  transformOrigin.value = origin
  lastKnownAnchorRect.value = rect
}

// ⚠️ 子菜单位置计算：独立 Teleport 到 body 后使用固定定位
// 复用主菜单定位算法，优先级: 右侧 > 下方/上方 > 左侧（避免右侧溢出时触发水平滚动条）
const updateProjectMenuPosition = () => {
  if (!hoverProjectMenuId.value) {
    return
  }
  const menuEl = projectMenuRef.value
  const anchorEl = projectMenuAnchorEl.value
  if (!menuEl || !anchorEl) {
    return
  }

  const anchorRect = anchorEl.getBoundingClientRect()
  const { width: menuWidth, height: menuHeight } = menuEl.getBoundingClientRect()
  
  // 子菜单优先向右展开,其次向下/上,最后向左
  const { x, y, origin, maxW, maxH } = computeMenuPosition(
    anchorRect, 
    menuWidth, 
    menuHeight, 
    ['right-start', 'right-end', 'bottom-start', 'top-start', 'left-start']
  )
  
  projectMenuCoords.value = { x, y, maxW, maxH }
  projectMenuTransformOrigin.value = origin
}

const openContextMenu = (conversationId: string, anchor: HTMLElement) => {
  activeAnchorEl.value = anchor
  lastKnownAnchorRect.value = anchor.getBoundingClientRect()
  hoverMenuId.value = conversationId
  nextTick(() => {
    updateContextMenuPosition(lastKnownAnchorRect.value)
  })
}

// ⚠️ 关闭菜单时必须同步关闭子菜单，并清理所有锚点引用
const closeContextMenu = () => {
  if (!hoverMenuId.value) {
    hoverProjectMenuId.value = null
    return
  }
  hoverMenuId.value = null
  hoverProjectMenuId.value = null
  activeAnchorEl.value = null
  lastKnownAnchorRect.value = null
  projectMenuAnchorEl.value = null
}

// ⚠️ 全局点击检测：必须同时检查主菜单和子菜单的 DOM 引用
// 因为子菜单独立 Teleport 到 body，不在主菜单的 DOM 树内
const handleGlobalPointerDown = (event: PointerEvent) => {
  if (!hoverMenuId.value) {
    return
  }
  const target = event.target as Node | null
  if (contextMenuRef.value && target && contextMenuRef.value.contains(target)) {
    return
  }
  if (projectMenuRef.value && target && projectMenuRef.value.contains(target)) {
    return
  }
  if (activeAnchorEl.value && target && activeAnchorEl.value.contains(target as Node)) {
    return
  }
  if (projectMenuAnchorEl.value && target && projectMenuAnchorEl.value.contains(target as Node)) {
    return
  }
  closeContextMenu()
}

const recomputeContextMenuPosition = () => {
  if (!hoverMenuId.value) {
    return
  }
  requestAnimationFrame(() => {
    updateContextMenuPosition()
    if (hoverProjectMenuId.value) {
      updateProjectMenuPosition()
    }
  })
}

// 开始编辑
const startEdit = (conversation: ConversationRecord) => {
  editingId.value = conversation.id
  editingTitle.value = conversation.title
}

// 保存编辑
const saveEdit = (conversationId: string) => {
  if (editingTitle.value.trim()) {
    chatStore.renameConversation(conversationId, editingTitle.value)
  }
  editingId.value = null
  editingTitle.value = ''
}

// 取消编辑
const cancelEdit = () => {
  editingId.value = null
  editingTitle.value = ''
}

// 开始删除确认
const startDelete = (conversationId: string) => {
  deletingId.value = conversationId
}

// 确认删除
const confirmDelete = (conversationId: string) => {
  const success = chatStore.deleteConversation(conversationId)
  if (!success) {
    console.error('删除失败：该对话可能正在使用中')
  }
  deletingId.value = null
}

// 取消删除
const cancelDelete = () => {
  deletingId.value = null
}

const createConversation = () => {
  const newId = chatStore.createNewConversation()
  // ✅ 改进：根据当前筛选视图智能分配项目
  if (projectFilter.value !== 'all' && projectFilter.value !== 'unassigned') {
    // 在指定项目视图中创建时，自动分配到该项目
    const success = chatStore.assignConversationToProject(newId, projectFilter.value)
    if (!success) {
      console.warn('⚠️ 自动分配项目失败，项目可能已被删除')
      projectFilter.value = 'all'
    }
  }
  // 在 "未分配" 或 "全部" 视图中创建时，保持 projectId 为 null
  chatStore.openConversationInTab(newId)
}

const handleRename = (conversation: ConversationRecord) => {
  startEdit(conversation)
  closeContextMenu()
}

const handleDelete = (conversation: ConversationRecord) => {
  startDelete(conversation.id)
  closeContextMenu()
}

const clearTimers = () => {
  if (hoverOpenTimer.value !== null) {
    clearTimeout(hoverOpenTimer.value)
    hoverOpenTimer.value = null
  }
  if (hoverCloseTimer.value !== null) {
    clearTimeout(hoverCloseTimer.value)
    hoverCloseTimer.value = null
  }
  if (hoverProjectOpenTimer.value !== null) {
    clearTimeout(hoverProjectOpenTimer.value)
    hoverProjectOpenTimer.value = null
  }
  if (hoverProjectCloseTimer.value !== null) {
    clearTimeout(hoverProjectCloseTimer.value)
    hoverProjectCloseTimer.value = null
  }
  closeContextMenu()
}

const scheduleOpenMenu = (conversationId: string, event: MouseEvent) => {
  const anchor = event.currentTarget as HTMLElement | null
  if (!anchor) {
    return
  }

  if (hoverMenuId.value === conversationId) {
    if (hoverCloseTimer.value !== null) {
      clearTimeout(hoverCloseTimer.value)
      hoverCloseTimer.value = null
    }
    activeAnchorEl.value = anchor
    updateContextMenuPosition(anchor.getBoundingClientRect())
    return
  }

  if (hoverCloseTimer.value !== null) {
    clearTimeout(hoverCloseTimer.value)
    hoverCloseTimer.value = null
  }

  if (hoverOpenTimer.value !== null) {
    clearTimeout(hoverOpenTimer.value)
    hoverOpenTimer.value = null
  }

  hoverOpenTimer.value = setTimeout(() => {
    openContextMenu(conversationId, anchor)
    hoverProjectMenuId.value = null
    hoverOpenTimer.value = null
  }, 150)
}

const scheduleCloseMenu = () => {
  if (hoverOpenTimer.value !== null) {
    clearTimeout(hoverOpenTimer.value)
    hoverOpenTimer.value = null
  }

  if (hoverCloseTimer.value !== null) {
    clearTimeout(hoverCloseTimer.value)
  }

  hoverCloseTimer.value = setTimeout(() => {
    closeContextMenu()
    hoverCloseTimer.value = null
  }, 200)
}

const cancelPendingMenuClose = () => {
  if (hoverCloseTimer.value !== null) {
    clearTimeout(hoverCloseTimer.value)
    hoverCloseTimer.value = null
  }
}

watch(hoverMenuId, async (next) => {
  if (next) {
    await nextTick()
    updateContextMenuPosition()
    document.addEventListener('pointerdown', handleGlobalPointerDown, true)
  } else {
    document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  }
})

// ⚠️ 监听子菜单打开：等待 DOM 渲染后重新计算位置
watch(hoverProjectMenuId, async (next) => {
  if (next) {
    await nextTick()
    updateProjectMenuPosition()
  }
})



const orderedProjects = computed<ProjectRecord[]>(() => {
  if (!Array.isArray(chatStore.projects)) {
    return []
  }
  return [...(chatStore.projects as ProjectRecord[])].sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || 0
    const bTime = b.updatedAt || b.createdAt || 0
    // ✅ 时间相同时，按 ID 排序确保稳定性
    if (bTime === aTime) {
      return a.id.localeCompare(b.id)
    }
    return bTime - aTime
  })
})

const projectManagerEntries = computed<ProjectRecord[]>(() => {
  const allEntry: ProjectRecord = {
    id: 'all',
    name: '全部对话',
    createdAt: 0,
    updatedAt: 0,
    isSystem: true
  }
  const unassignedEntry: ProjectRecord = {
    id: 'unassigned',
    name: '未分配',
    createdAt: 0,
    updatedAt: 0,
    isSystem: true
  }
  return [allEntry, unassignedEntry, ...orderedProjects.value.map(project => ({ ...project }))]
})

const projectConversationCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = { unassigned: 0 }
  for (const conversation of chatStore.conversations as ConversationRecord[]) {
    const projectId = conversation.projectId
    if (projectId) {
      counts[projectId] = (counts[projectId] || 0) + 1
    } else {
      counts.unassigned += 1
    }
  }
  return counts
})

const totalConversationCount = computed(() => (chatStore.conversations as ConversationRecord[]).length)

const getProjectCount = (projectId: string) => {
  if (projectId === 'all') {
    return totalConversationCount.value
  }
  return projectConversationCounts.value[projectId] ?? 0
}

const getProjectLabel = (projectId: string | null | undefined) => {
  if (!projectId) {
    return '未分配'
  }
  const project = chatStore.getProjectById(projectId)
  return project?.name ?? '未分配'
}

const conversationMatchesContent = (conversation: ConversationRecord, query: string) => {
  // 使用全文搜索结果
  if (contentSearchActive.value) {
    return contentSearchHits.value.has(conversation.id)
  }
  if (!query) {
    return true
  }
  const tree = conversation.tree
  if (!tree?.currentPath || !Array.isArray(tree.currentPath) || tree.currentPath.length === 0) {
    return false
  }
  const branchesSource = tree.branches as Map<string, any> | Record<string, any> | undefined
  if (!branchesSource) {
    return false
  }

  const getBranch = (branchId: string) => {
    if (branchesSource && typeof (branchesSource as Map<string, any>).get === 'function') {
      return (branchesSource as Map<string, any>).get(branchId)
    }
    return (branchesSource as Record<string, any>)[branchId]
  }

  for (const branchId of tree.currentPath) {
    const branch = getBranch(branchId)
    if (!branch) continue
    const versions = Array.isArray(branch.versions) ? branch.versions : []
    const versionIndex = typeof branch.currentVersionIndex === 'number' ? branch.currentVersionIndex : 0
    const currentVersion = versions[versionIndex] || versions[0]
    if (!currentVersion || !Array.isArray(currentVersion.parts)) continue
    for (const part of currentVersion.parts) {
      if (part?.type === 'text' && typeof part.text === 'string' && part.text.toLowerCase().includes(query)) {
        return true
      }
    }
  }
  return false
}

const buildSearchScopes = () => {
  const scopes = {
    title: searchInTitle.value,
    content: searchInContent.value
  }
  if (!scopes.title && !scopes.content) {
    scopes.title = true
  }
  return scopes
}

let contentSearchRequestId = 0
const resetContentSearch = () => {
  contentSearchHits.value = new Set()
  contentSearchMessage.value = ''
  contentSearchMessageType.value = 'info'
  contentSearchLoading.value = false
}

watch(
  [() => rawSearchQuery.value, searchInContent],
  async ([query, searchContent]) => {
    if (!searchContent || !query) {
      resetContentSearch()
      return
    }

    const requestId = ++contentSearchRequestId
    contentSearchLoading.value = true
    contentSearchMessage.value = ''
    contentSearchMessageType.value = 'info'

    try {
      const results = await runFulltextSearch(query, { limit: 100, highlight: false })
      if (requestId !== contentSearchRequestId) {
        return
      }
      contentSearchHits.value = new Set(results.map(result => result.convoId))
      contentSearchMessageType.value = 'info'
      contentSearchMessage.value = results.length === 0 ? '未找到匹配内容' : `命中 ${results.length} 条内容`
    } catch (error) {
      if (requestId !== contentSearchRequestId) {
        return
      }
      contentSearchHits.value = new Set()
      if (error instanceof SearchDslError) {
        contentSearchMessageType.value = 'warning'
        contentSearchMessage.value = error.message
      } else {
        contentSearchMessageType.value = 'error'
        contentSearchMessage.value = '全文搜索失败，请稍后重试'
        console.error('全文搜索失败:', error)
      }
    } finally {
      if (requestId === contentSearchRequestId) {
        contentSearchLoading.value = false
      }
    }
  },
  { immediate: true }
)

const filteredConversations = computed<ConversationRecord[]>(() => {
  const conversations = chatStore.conversations as ConversationRecord[]
  const query = normalizedQuery.value
  const scopes = buildSearchScopes()

  return conversations.filter(conversation => {
    if (projectFilter.value === 'unassigned' && conversation.projectId) {
      return false
    }
    if (projectFilter.value !== 'all' && projectFilter.value !== 'unassigned' && conversation.projectId !== projectFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    if (scopes.title && (conversation.title || '').toLowerCase().includes(query)) {
      return true
    }

    if (scopes.content && conversationMatchesContent(conversation, query)) {
      return true
    }

    return false
  })
})

watch(filteredConversations, (list) => {
  if (!hoverMenuId.value) {
    return
  }
  if (!list.some(conversation => conversation.id === hoverMenuId.value)) {
    closeContextMenu()
  }
})

const handleCreateProject = () => {
  const createdId = chatStore.createProject(newProjectName.value)
  if (createdId) {
    // ✅ 无论是新建还是跳转到已存在项目，都切换筛选器
    projectFilter.value = createdId
    newProjectName.value = ''
    isCreatingProject.value = false
    newProjectInputRef.value = null
  }
}

const isProjectSelected = (projectId: string) => projectFilter.value === projectId

const selectProject = (projectId: string) => {
  projectFilter.value = projectId
}

const toggleProjectCreation = () => {
  if (isCreatingProject.value) {
    newProjectName.value = ''
    nextTick(() => {
      newProjectInputRef.value = null
    })
  }
  isCreatingProject.value = !isCreatingProject.value
  if (isCreatingProject.value) {
    nextTick(() => {
      newProjectInputRef.value?.focus()
    })
  }
}

const startProjectEdit = (project: ProjectRecord) => {
  if (project.isSystem) {
    return
  }
  projectEditingId.value = project.id
  projectEditingName.value = project.name
}

let projectSyncReady = false

watch(
  () => chatStore.activeProjectId,
  (next) => {
    projectSyncReady = true
    const target = next ?? 'all'
    if (projectFilter.value !== target) {
      projectFilter.value = target
    }
  },
  { immediate: true }
)

watch(projectFilter, (next) => {
  if (!projectSyncReady) {
    return
  }
  if (next === 'all') {
    chatStore.setActiveProject(null)
    return
  }
  chatStore.setActiveProject(next)
})

const cancelProjectEdit = () => {
  projectEditingId.value = null
  projectEditingName.value = ''
}

const confirmProjectRename = (projectId: string) => {
  if (projectId === 'unassigned') {
    return
  }
  const result = chatStore.renameProject(projectId, projectEditingName.value)
  if (result === true) {
    // ✅ 重命名成功
    projectEditingId.value = null
    projectEditingName.value = ''
  } else if (typeof result === 'string') {
    // ✅ 名称重复，跳转到已存在的项目
    projectFilter.value = result
    projectEditingId.value = null
    projectEditingName.value = ''
  }
  // result === false 时，名称为空或项目不存在，不做处理
}

const requestProjectDelete = (projectId: string) => {
  if (projectId === 'unassigned') {
    return
  }
  projectDeletingId.value = projectId
}

const cancelProjectDelete = () => {
  projectDeletingId.value = null
}

const confirmProjectDelete = (projectId: string) => {
  if (projectId === 'unassigned') {
    return
  }
  const success = chatStore.deleteProject(projectId)
  // ✅ 删除项目后，切换到 "all" 而非 "unassigned"
  if (success && projectFilter.value === projectId) {
    projectFilter.value = 'all'
  }
  projectDeletingId.value = null
}

const openProjectMenu = (conversationId: string) => {
  // 如果已经是当前对话的项目菜单，取消关闭定时器
  if (hoverProjectMenuId.value === conversationId) {
    if (hoverProjectCloseTimer.value !== null) {
      clearTimeout(hoverProjectCloseTimer.value)
      hoverProjectCloseTimer.value = null
    }
    return
  }

  // 清除之前的关闭定时器
  if (hoverProjectCloseTimer.value !== null) {
    clearTimeout(hoverProjectCloseTimer.value)
    hoverProjectCloseTimer.value = null
  }

  // 清除之前的打开定时器
  if (hoverProjectOpenTimer.value !== null) {
    clearTimeout(hoverProjectOpenTimer.value)
    hoverProjectOpenTimer.value = null
  }

  // 延迟150ms打开
  hoverProjectOpenTimer.value = setTimeout(() => {
    hoverProjectMenuId.value = conversationId
    hoverProjectOpenTimer.value = null
  }, 150)
}

const closeProjectMenu = () => {
  // 清除打开定时器
  if (hoverProjectOpenTimer.value !== null) {
    clearTimeout(hoverProjectOpenTimer.value)
    hoverProjectOpenTimer.value = null
  }

  // 清除之前的关闭定时器
  if (hoverProjectCloseTimer.value !== null) {
    clearTimeout(hoverProjectCloseTimer.value)
  }

  // 延迟200ms关闭
  hoverProjectCloseTimer.value = setTimeout(() => {
    hoverProjectMenuId.value = null
    hoverProjectCloseTimer.value = null
  }, 200)
}

const cancelPendingProjectMenuClose = () => {
  if (hoverProjectCloseTimer.value !== null) {
    clearTimeout(hoverProjectCloseTimer.value)
    hoverProjectCloseTimer.value = null
  }
  // Prevent the parent context menu from closing while the pointer is inside the teleported submenu
  cancelPendingMenuClose()
}

const changeConversationProject = (conversationId: string, projectId: string | null) => {
  const conversations = chatStore.conversations as ConversationRecord[]
  const conversation = conversations.find(item => item.id === conversationId)
  if (!conversation) {
    return
  }

  const normalizedId = projectId ?? null
  if ((conversation.projectId ?? null) === normalizedId) {
    hoverProjectMenuId.value = null
    closeContextMenu()
    return
  }

  if (!projectId) {
    chatStore.removeConversationFromProject(conversationId)
  } else {
    const success = chatStore.assignConversationToProject(conversationId, projectId)
    if (!success) {
      return
    }
  }

  hoverProjectMenuId.value = null
  closeContextMenu()
}

// 键盘快捷键处理
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault()
    createConversation()
  }
}

watch(
  () => {
    const list = Array.isArray(chatStore.projects) ? (chatStore.projects as ProjectRecord[]) : []
    return list.map(project => project.id)
  },
  (projectIds) => {
    if (projectFilter.value !== 'all' && projectFilter.value !== 'unassigned' && !projectIds.includes(projectFilter.value)) {
      projectFilter.value = 'all'
    }
  }
)


onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', recomputeContextMenuPosition)
  window.addEventListener('scroll', recomputeContextMenuPosition, true)

  registerDprMediaQuery()
})

// ⚠️ 组件卸载时必须清理所有 ResizeObserver，避免内存泄漏
onUnmounted(() => {
  clearTimers()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', recomputeContextMenuPosition)
  window.removeEventListener('scroll', recomputeContextMenuPosition, true)
  document.removeEventListener('pointerdown', handleGlobalPointerDown, true)

  detachDprMediaQuery()

  if (menuResizeObserver) {
    menuResizeObserver.disconnect()
    menuResizeObserver = null
  }
  
  if (projectMenuResizeObserver) {
    projectMenuResizeObserver.disconnect()
    projectMenuResizeObserver = null
  }
})
</script>

<template>
  <div class="flex flex-col h-full bg-gray-100 border-r border-gray-200">
    <!-- 侧边栏头部 -->
    <div class="p-4 border-b border-gray-200 bg-white space-y-3">
      <button
        @click="createConversation"
        class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        title="Ctrl+N"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        新建对话
      </button>
      <p class="text-xs text-gray-500 text-center">快捷键: Ctrl+N</p>

      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            class="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      <div class="flex items-center justify-between text-xs text-gray-600">
        <label class="flex items-center gap-1">
          <input v-model="searchInTitle" type="checkbox" class="rounded border-gray-300" />
          标题
        </label>
        <label class="flex items-center gap-1">
          <input v-model="searchInContent" type="checkbox" class="rounded border-gray-300" />
          内容
        </label>
        <select v-model="projectFilter" class="text-xs border-gray-300 rounded px-2 py-1">
          <option value="all">全部对话</option>
          <option value="unassigned">未分配（{{ getProjectCount('unassigned') }}）</option>
          <option v-for="project in orderedProjects" :key="project.id" :value="project.id">
            {{ project.name }}（{{ getProjectCount(project.id) }}）
          </option>
        </select>
      </div>
      <div
        v-if="contentSearchActive"
        class="flex items-center gap-2 text-xs"
        :class="contentSearchMessageClass"
      >
        <svg
          v-if="contentSearchLoading"
          class="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z"></path>
        </svg>
        <span>{{ contentSearchMessage || '正在全文搜索…' }}</span>
      </div>

      <div class="border-t border-gray-200 pt-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">项目管理</span>
          <button
            class="text-xs text-blue-500 hover:text-blue-600"
            @click="toggleProjectCreation"
          >
            {{ isCreatingProject ? '取消' : '新建项目' }}
          </button>
        </div>

        <div v-if="isCreatingProject" class="flex gap-2">
          <input
            v-model="newProjectName"
            type="text"
            placeholder="输入项目名称"
            class="flex-1 px-3 py-1 text-sm border border-gray-300 rounded"
            ref="newProjectInputRef"
          />
          <button
            class="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600"
            @click="handleCreateProject"
            :disabled="!newProjectName.trim()"
          >
            创建
          </button>
        </div>

        <div v-if="orderedProjects.length === 0 && !isCreatingProject" class="text-xs text-gray-500">
          暂无项目。可点击“新建项目”开始分类管理。
        </div>

        <div
          v-for="project in projectManagerEntries"
          :key="project.id"
          class="flex items-center gap-2 text-sm rounded-lg px-2 py-1 transition-colors"
          :class="[
            isProjectSelected(project.id) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
            projectEditingId === project.id ? 'cursor-default' : 'cursor-pointer'
          ]"
          @click="projectEditingId !== project.id && selectProject(project.id)"
        >
          <div class="flex-1">
            <div v-if="project.isSystem || projectEditingId !== project.id" class="flex items-center justify-between">
              <span class="font-medium text-gray-700">{{ project.name }}</span>
              <span class="text-xs text-gray-500">
                包含 {{ getProjectCount(project.id) }} 个对话
              </span>
            </div>
            <div v-else class="flex gap-2">
              <input
                v-model="projectEditingName"
                type="text"
                class="flex-1 px-2 py-1 border border-gray-300 rounded"
              />
              <button class="px-2 py-1 text-xs text-green-600" @click.stop="confirmProjectRename(project.id)">
                保存
              </button>
              <button class="px-2 py-1 text-xs text-gray-500" @click.stop="cancelProjectEdit">
                取消
              </button>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              v-if="!project.isSystem"
              class="text-xs text-blue-500 hover:text-blue-600"
              @click.stop="startProjectEdit(project)"
            >
              重命名
            </button>
            <button
              v-if="!project.isSystem"
              class="text-xs text-red-500 hover:text-red-600"
              @click.stop="requestProjectDelete(project.id)"
            >
              删除
            </button>
          </div>
        </div>

        <div v-if="projectDeletingId" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
          <div class="flex items-center justify-between">
            <span>确认删除该项目？该项目下的对话将标记为未分配。</span>
            <div class="flex gap-2">
              <button class="text-blue-500" @click="cancelProjectDelete">取消</button>
              <button class="text-red-600" @click="projectDeletingId && confirmProjectDelete(projectDeletingId)">确认</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 对话列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <div
        v-for="conversation in filteredConversations"
        :key="conversation.id"
        class="mb-2 group"
      >
        <div
          :class="[
            'rounded-lg p-3 cursor-pointer transition-all',
            chatStore.activeTabId === conversation.id
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white hover:bg-gray-50 text-gray-700'
          ]"
        >
          <!-- 正常显示模式 -->
          <div v-if="editingId !== conversation.id && deletingId !== conversation.id" class="flex items-center justify-between">
            <div
              @click="chatStore.openConversationInTab(conversation.id)"
              class="flex-1 min-w-0"
            >
              <div class="font-medium flex items-center gap-2">
                <div class="flex flex-col flex-1 min-w-0">
                  <span class="truncate">{{ conversation.title }}</span>
                  <span class="text-[11px] text-blue-100" v-if="conversation.projectId">
                    {{ getProjectLabel(conversation.projectId) }}
                  </span>
                  <span class="text-[11px] text-gray-400" v-else>
                    未分配
                  </span>
                </div>

                
                <!-- 生成状态指示器 -->
                <!-- 发送中：蓝色旋转图标 -->
                <svg
                  v-if="conversation.generationStatus === 'sending'"
                  class="w-4 h-4 flex-shrink-0 animate-spin"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-blue-500'
                  ]"
                  fill="none"
                  viewBox="0 0 24 24"
                  title="正在发送..."
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                
                <!-- 接收中：绿色脉冲圆点 -->
                <svg
                  v-else-if="conversation.generationStatus === 'receiving'"
                  class="w-4 h-4 flex-shrink-0 animate-pulse"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-green-500'
                  ]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  title="正在接收..."
                >
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                
                <!-- 有错误：警告图标 -->
                <svg
                  v-else-if="conversation.hasError"
                  class="w-4 h-4 flex-shrink-0"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-yellow-300'
                      : 'text-yellow-500'
                  ]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  title="上次生成出错"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                
                <!-- 空闲且成功：绿色勾（仅当有消息时显示） -->
                <svg
                  v-else-if="conversation.generationStatus === 'idle' && (conversation.tree?.currentPath?.length ?? 0) > 0 && !conversation.hasError"
                  class="w-4 h-4 flex-shrink-0"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-green-500'
                  ]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  title="就绪"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div
                :class="[
                  'text-xs mt-1 flex items-center gap-1',
                  chatStore.activeTabId === conversation.id
                    ? 'text-blue-100'
                    : 'text-gray-500'
                ]"
              >
                <span>{{ conversation.tree?.currentPath?.length || 0 }} 条消息</span>
                <span>•</span>
                <span class="truncate max-w-[120px]" :title="conversation.model">
                  {{ formatModelName(conversation.model) }}
                </span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div
                class="relative"
                @mouseenter="(event) => scheduleOpenMenu(conversation.id, event)"
                @mouseleave="scheduleCloseMenu()"
              >
                <button
                  @click.stop
                  :class="[
                    'p-1.5 rounded hover:bg-opacity-20 transition-colors flex items-center justify-center',
                    chatStore.activeTabId === conversation.id ? 'text-white hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'
                  ]"
                  title="更多操作"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </button>
                <Teleport to="body">
                  <div
                    v-if="hoverMenuId === conversation.id"
                    :ref="setContextMenuRef"
                    class="fixed z-[1300] min-w-48 max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl text-sm text-gray-700 overflow-auto"
                    :style="contextMenuStyle"
                    @mouseenter="cancelPendingMenuClose"
                    @mouseleave="scheduleCloseMenu()"
                    @click.stop
                  >
                    <button
                      class="w-full text-left px-4 py-2 hover:bg-gray-100"
                      @click="handleRename(conversation)"
                    >
                      重命名
                    </button>
                    <button
                      class="w-full text-left px-4 py-2 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      :disabled="conversation.generationStatus !== 'idle'"
                      @click="conversation.generationStatus === 'idle' && handleDelete(conversation)"
                    >
                      删除
                    </button>
                    <div class="border-t border-gray-100 my-1"></div>
                    <div class="px-2 pb-2">
                      <button
                        :ref="el => setProjectMenuAnchor(el as HTMLElement)"
                        class="w-full flex items-center justify-between px-3 py-1.5 text-left rounded-md hover:bg-gray-100"
                        type="button"
                        @mouseenter="openProjectMenu(conversation.id)"
                        @mouseleave="closeProjectMenu"
                      >
                        <span class="text-sm text-gray-700">移动到项目</span>
                        <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M5.5 3.5L10.5 8L5.5 12.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </Teleport>
                
                <!-- ⚠️ 项目子菜单：必须独立 Teleport 到 body，不能嵌套在主菜单内 -->
                <!-- 原因：避免被主菜单的 overflow-auto 和 stacking context 影响 -->
                <Teleport to="body">
                  <div
                    v-if="hoverProjectMenuId === conversation.id"
                    :ref="setProjectMenuRef"
                    class="fixed z-[1310] w-44 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-sm text-gray-700 overflow-y-auto overflow-x-hidden"
                    :style="projectMenuStyle"
                    @mouseenter="cancelPendingProjectMenuClose"
                    @mouseleave="closeProjectMenu"
                    @click.stop
                  >
                    <button
                      class="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100"
                      :class="(conversation.projectId ?? null) === null ? 'text-blue-600 font-medium' : 'text-gray-700'"
                      type="button"
                      @click.stop="changeConversationProject(conversation.id, null)"
                    >
                      <span>未分配</span>
                      <svg
                        v-if="(conversation.projectId ?? null) === null"
                        class="w-4 h-4 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>

                    <div
                      v-if="orderedProjects.length > 0"
                      class="border-t border-gray-100 my-1"
                    ></div>

                    <div
                      v-if="orderedProjects.length === 0"
                      class="px-3 py-2 text-xs text-gray-400"
                    >
                      暂无项目，可在侧栏创建。
                    </div>

                    <button
                      v-for="project in orderedProjects"
                      :key="project.id"
                      class="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100"
                      :class="conversation.projectId === project.id ? 'text-blue-600 font-medium' : 'text-gray-700'"
                      type="button"
                      @click.stop="changeConversationProject(conversation.id, project.id)"
                    >
                      <span class="truncate">{{ project.name }}</span>
                      <svg
                        v-if="conversation.projectId === project.id"
                        class="w-4 h-4 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </Teleport>
              </div>
            </div>
          </div>

          <!-- 删除确认模式 -->
          <div v-else-if="deletingId === conversation.id" class="flex items-center justify-between">
            <div class="flex-1 text-sm font-medium">
              <span :class="chatStore.activeTabId === conversation.id ? 'text-white' : 'text-gray-700'">
                确定删除？
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click.stop="confirmDelete(conversation.id)"
                class="p-1.5 rounded transition-colors"
                :class="[
                  chatStore.activeTabId === conversation.id
                    ? 'text-white hover:bg-green-500 hover:bg-opacity-20'
                    : 'text-green-600 hover:bg-green-100'
                ]"
                title="确认删除"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                </svg>
              </button>
              <button
                @click.stop="cancelDelete"
                class="p-1.5 rounded transition-colors"
                :class="[
                  chatStore.activeTabId === conversation.id
                    ? 'text-white hover:bg-red-500 hover:bg-opacity-20'
                    : 'text-red-600 hover:bg-red-100'
                ]"
                title="取消"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- 编辑模式 -->
          <div v-else class="flex items-center gap-2">
            <input
              v-model="editingTitle"
              @keyup.enter="saveEdit(conversation.id)"
              @keyup.esc="cancelEdit"
              class="flex-1 px-2 py-1 bg-white text-gray-900 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autofocus
            />
            <button
              @click="saveEdit(conversation.id)"
              class="p-1 text-green-600 hover:bg-green-100 rounded"
              title="保存"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <button
              @click="cancelEdit"
              class="p-1 text-gray-600 hover:bg-gray-200 rounded"
              title="取消"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="chatStore.conversations.length === 0" class="text-center text-gray-500 mt-12 px-4">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        <p class="text-sm font-medium mb-2">暂无对话</p>
        <p class="text-xs text-gray-400">点击上方按钮创建新对话</p>
        <p class="text-xs text-gray-400 mt-1">或按 <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">Ctrl+N</kbd></p>
      </div>
    </div>
  </div>
</template>
