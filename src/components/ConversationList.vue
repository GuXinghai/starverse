<script setup lang="ts">
/**
 * ================================================================================
 * ConversationList.vue - 大型组件重构计划
 * ================================================================================
 * 
 * 🚨 重要提示: 本组件共 1778 行，包含两个业务域的紧密耦合代码，需要增量式重构
 * 
 * 📊 当前架构问题:
 *   1. 业务域混杂: Conversation List (900 行) + Project Tree (650 行)
 *   2. 状态管理复杂: 42 个响应式变量，6 个定时器，2 个 ResizeObserver
 *   3. 高风险区域: projectFilter 双向同步、菜单级联关闭、跨域操作
 * 
 * 🎯 重构目标:
 *   ✅ TODO 1: 创建基础设施 Composables (低风险)
 *      - useFormatters.ts (formatModelName, getStatusLabel, getStatusBadgeClass)
 *      - useMenuPositioning.ts (computeMenuPosition 算法)
 *      - useConversationSearch.ts (搜索逻辑和状态)
 * 
 *   ✅ TODO 2: 创建 ProjectManager 子组件 (中风险)
 *      - 提取 1022-1094 行模板 + 833-957 行脚本
 *      - Props: projects[], projectFilter, activeProjectId
 *      - Emits: update:projectFilter, project-created, project-renamed, project-deleted
 * 
 *   🔴 TODO 3: 创建菜单系统 Composables (高风险 ⚠️)
 *      - useContextMenu.ts + useProjectAssignmentMenu.ts
 *      - 处理主菜单和子菜单的级联关闭 (见 394-402 行)
 *      - 必须正确清理定时器和 ResizeObserver
 * 
 *   ✅ TODO 4: 创建 ConversationListItems 子组件 (中风险)
 *      - 提取 1099-1583 行模板
 *      - Props: filteredConversations[], currentConversationId
 *      - Emits: conversation-selected, conversation-renamed, conversation-deleted
 * 
 *   🔴 TODO 5: 重构 projectFilter 双向同步逻辑 (高风险 ⚠️)
 *      - 解决 895-917 行的双向 watch 问题
 *      - 移除 projectSyncReady 全局标志位
 *      - 改为单向数据流 + emit 模式
 * 
 *   🔴 TODO 6: 重构 changeConversationProject 跨域方法 (高风险 ⚠️)
 *      - 拆分 1011-1035 行的跨域操作
 *      - 严格执行菜单关闭顺序，避免 Teleport DOM 残留
 * 
 *   🔴 TODO 7: 创建 ConversationSidebar 父组件 (高风险 ⚠️)
 *      - 管理所有跨域状态和逻辑
 *      - 通过 provide/inject 共享 stores 和菜单回调
 * 
 *   ✅ TODO 8: 优化 filteredConversations 性能 (中风险)
 *      - 788-827 行依赖 6 个响应式源
 *      - 添加 WeakMap 缓存、虚拟滚动、分页
 * 
 *   ✅ TODO 9: 编写单元测试 (必需)
 *      - 覆盖率目标 > 85%
 *      - 重点测试菜单级联关闭、projectFilter 同步
 * 
 *   ✅ TODO 10: 迁移原组件并清理 (最终步骤)
 *      - ConversationList.vue → ConversationList.legacy.vue
 *      - ConversationSidebar.vue → ConversationList.vue
 *      - 保留 .legacy 至少 2 周作为回滚保险
 * 
 * ⚠️ 安全重构原则:
 *   1. 增量式重构，每次只改动一个 TODO
 *   2. 先提取低风险 composables，再拆分组件
 *   3. 高风险区域必须先编写测试
 *   4. 每个 TODO 完成后运行完整的 E2E 测试
 *   5. 确保每次提交都可独立回滚
 * 
 * 📝 相关文档:
 *   - 详细分析报告: 见 AI 生成的《ConversationList.vue 深度分析报告》
 *   - 架构审查: docs/ARCHITECTURE_REVIEW.md
 *   - 重构进度: REFACTOR_PROGRESS.md
 * ================================================================================
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { useProjectStore } from '../stores/project'
import { useModelStore } from '../stores/model'
import { runFulltextSearch, SearchDslError } from '../services/searchService'
import type { ConversationStatus } from '../types/conversation'
import { useFormatters } from '../composables/useFormatters'
import { useMenuPositioning } from '../composables/useMenuPositioning'

type ConversationRecord = {
  id: string
  title: string
  projectId?: string | null
  model: string
  status?: ConversationStatus
  generationStatus?: 'idle' | 'sending' | 'receiving'
  isGenerating?: boolean
  hasError?: boolean
  createdAt: number
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

const conversationStore = useConversationStore()
const projectStore = useProjectStore()
const modelStore = useModelStore()

// ✅ TODO 1 已完成: 使用 useFormatters composable
const { getStatusLabel, getStatusBadgeClass, getStatusBadgeClassActive, formatModelName } = useFormatters()

// ✅ TODO 1.2 已完成: 使用 useMenuPositioning composable
const { computeMenuPosition } = useMenuPositioning()

// 检查对话是否正在生成中
const isConversationGenerating = (conversation: ConversationRecord): boolean => {
  // 优先使用 isGenerating 字段，如果不存在则使用 generationStatus
  if (conversation.isGenerating !== undefined) {
    return conversation.isGenerating
  }
  // 如果有 generationStatus，检查是否为 'idle'
  if (conversation.generationStatus) {
    return conversation.generationStatus !== 'idle'
  }
  // 默认不生成中
  return false
}

/**
 * ========================================
 * 响应式状态变量分类 (共 42 个)
 * ========================================
 * 
 * 🟦 Conversation List 专属 (14 个) - TODO 4 迁移到 ConversationListItems
 * 🟩 Project Tree 专属 (10 个) - TODO 2 迁移到 ProjectManager
 * 🟨 菜单系统共享 (18 个) - TODO 3 迁移到 useContextMenu/useProjectAssignmentMenu
 * 
 * 重构后状态管理:
 *   - 子组件内部状态: 编辑/删除 ID、输入框内容
 *   - 父组件统筹状态: projectFilter、filteredConversations
 *   - Composable 封装状态: 菜单定位、搜索缓存
 * ========================================
 */

// 🟦 Conversation List 编辑状态 - TODO 4: 迁移到 ConversationListItems 组件内部
const editingId = ref<string | null>(null)
const editingTitle = ref('')

// 🟦 Conversation List 删除确认状态 - TODO 4: 迁移到 ConversationListItems 组件内部
const deletingId = ref<string | null>(null)

// 🟦 Conversation List 搜索与过滤 - TODO 1: 迁移到 useConversationSearch composable
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

// 🔴 跨域状态 - TODO 5: 重构为单向数据流，迁移到 ConversationSidebar 父组件
const projectFilter = ref<string>('all')

// 🟩 Project Tree 管理状态 - TODO 2: 迁移到 ProjectManager 组件
const isCreatingProject = ref(false)
const newProjectName = ref('')
const projectEditingId = ref<string | null>(null)
const projectEditingName = ref('')
const projectDeletingId = ref<string | null>(null)
const newProjectInputRef = ref<HTMLInputElement | null>(null)

// 🟨 菜单系统状态 - TODO 3: 迁移到 useContextMenu composable
const hoverMenuId = ref<string | null>(null)
const hoverOpenTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 🟨 子菜单系统状态 - TODO 3: 迁移到 useProjectAssignmentMenu composable
const hoverProjectMenuId = ref<string | null>(null)
const hoverProjectOpenTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverProjectCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)

/**
 * ========================================
 * TODO 3: 菜单定位系统状态管理
 * ========================================
 * 
 * 重要说明:
 *   主菜单和子菜单都必须 Teleport 到 body 并使用 fixed 定位
 *   原因: 避免被父容器的 overflow 裁剪，确保始终浮在最上层
 *   参考文档: docs/SUBMENU_TELEPORT_FIX.md
 * 
 * 重构后:
 *   - 提取到 useContextMenu composable
 *   - 返回 { menuRef, menuStyle, openMenu, closeMenu, ... }
 *   - 父组件通过 provide/inject 共享菜单实例
 * ========================================
 */
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

// ✅ TODO 1.2 已完成: computeMenuPosition 已移至 useMenuPositioning composable

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

/**
 * ========================================
 * 🔴 高风险区域 - TODO 3: 菜单系统级联关闭逻辑
 * ========================================
 * 
 * 当前问题:
 *   1. 主菜单 (hoverMenuId) 和子菜单 (hoverProjectMenuId) 状态强耦合
 *   2. 必须手动同步清理 5 个相关状态变量
 *   3. 如果清理顺序错误，可能导致 Teleport 的 DOM 残留
 * 
 * 重构策略:
 *   1. 提取到 useContextMenu composable，使用状态机管理:
 *      enum MenuState { Closed, MainMenuOpen, SubMenuOpen }
 *   2. 关闭顺序必须严格执行:
 *      Step 1: hoverProjectMenuId = null (关闭子菜单)
 *      Step 2: 等待 nextTick() (确保 Teleport 卸载)
 *      Step 3: projectMenuAnchorEl = null (清理子菜单锚点)
 *      Step 4: hoverMenuId = null (关闭主菜单)
 *      Step 5: activeAnchorEl = null (清理主菜单锚点)
 *   3. 使用 onScopeDispose 确保所有 ResizeObserver 被 disconnect
 *   4. 所有定时器 (6 个) 必须在关闭时清理
 * 
 * 测试要求:
 *   - 打开子菜单后点击外部，验证两个菜单都关闭且无 DOM 残留
 *   - 快速打开/关闭菜单 20 次，检查内存泄漏 (Chrome DevTools Memory)
 *   - 验证 ResizeObserver 正确 disconnect (控制台无警告)
 * ========================================
 */
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

/**
 * ========================================
 * TODO 3 相关: 全局点击检测跨组件逻辑
 * ========================================
 * 
 * 当前实现:
 *   必须同时检查主菜单和子菜单的 DOM 引用，因为子菜单通过 Teleport
 *   独立渲染到 body，不在主菜单的 DOM 树内
 * 
 * 重构后:
 *   1. 将此逻辑移入 useContextMenu composable
 *   2. 使用 provide/inject 共享菜单 ref:
 *      provide('contextMenuRefs', { mainMenuRef, subMenuRef })
 *   3. 子组件通过 inject 获取并在本地添加点击检测
 *   4. 考虑使用 vOnClickOutside (@vueuse/core) 替代手动实现
 * ========================================
 */
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
const saveEdit = async (conversationId: string) => {
  if (editingTitle.value.trim()) {
    conversationStore.renameConversation(conversationId, editingTitle.value)
    
    // 立即保存到 SQLite
    const conversation = conversationStore.conversationMap.get(conversationId)
    if (conversation) {
      try {
        const { serializeTree } = await import('../stores/branchTreeHelpers')
        const { sqliteChatPersistence } = await import('../services/chatPersistence')
        
        const serializedTree = serializeTree(conversation.tree)
        const snapshot = {
          id: conversation.id,
          title: conversation.title,
          draft: conversation.draft,
          tree: serializedTree,
          model: conversation.model,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          projectId: conversation.projectId,
          status: conversation.status,
          tags: conversation.tags,
          webSearchEnabled: conversation.webSearch?.enabled ?? false,
          webSearchLevel: conversation.webSearch?.level ?? 'normal',
          reasoningPreference: conversation.reasoning ?? { visibility: 'visible', effort: 'medium', maxTokens: null }
        }
        
        await sqliteChatPersistence.saveConversation(snapshot)
        console.log('✅ 对话重命名已保存到 SQLite:', conversation.title)
      } catch (error) {
        console.error('❌ 保存对话重命名失败:', error)
      }
    }
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
const confirmDelete = async (conversationId: string) => {
  const success = await conversationStore.deleteConversation(conversationId)
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
  // 确定当前项目上下文（将 'all' 视为 null，'unassigned' 视为 null）
  const currentProjectId = 
    projectFilter.value === 'all' || projectFilter.value === 'unassigned' 
      ? null 
      : projectFilter.value

  // 获取该项目下最新的对话（按 createdAt 降序排序）
  const conversationsInProject = conversationStore.conversations
    .filter(conv => conv.projectId === currentProjectId)
    .sort((a, b) => b.createdAt - a.createdAt)
  
  const latestConversation = conversationsInProject[0]

  // 获取当前默认的对话创建参数（未来可能从项目配置中获取）
  const defaultConversationParams = {
    title: '新对话',
    model: modelStore.selectedModel || 'auto',
    webSearchEnabled: false,
    webSearchLevel: 'normal' as const,
    // 未来可能包括：预设 prompt、自定义参数等
  }

  // 检查最新对话的参数是否与当前默认参数相同
  if (latestConversation) {
    const tree = latestConversation.tree
    const hasMessages = tree.branches.size > 0 && 
      Array.from(tree.branches.values()).some(branch => 
        branch.versions.some(version => 
          version.parts && version.parts.length > 0
        )
      )
    
    // 比较对话参数是否相同
    const isSameParams = 
      latestConversation.title === defaultConversationParams.title &&
      latestConversation.model === defaultConversationParams.model &&
      latestConversation.webSearch?.enabled === defaultConversationParams.webSearchEnabled &&
      latestConversation.webSearch?.level === defaultConversationParams.webSearchLevel
      // 未来添加更多参数比较，如：预设 prompt、reasoning 设置等

    // 如果参数相同且没有消息，直接跳转
    if (isSameParams && !hasMessages) {
      conversationStore.openConversationInTab(latestConversation.id)
      console.log('ℹ️ 已存在相同参数的空白对话，直接跳转:', latestConversation.id)
      return
    }
  }

  // 创建新对话
  const newConversation = conversationStore.createConversation()
  const newId = newConversation.id
  
  // 根据当前筛选视图智能分配项目
  if (projectFilter.value !== 'all' && projectFilter.value !== 'unassigned') {
    // 在指定项目视图中创建时，自动分配到该项目
    const success = projectStore.assignConversationToProject(newId, projectFilter.value)
    if (!success) {
      console.warn('⚠️ 自动分配项目失败，项目可能已被删除')
      projectFilter.value = 'all'
    }
  }
  // 在 "未分配" 或 "全部" 视图中创建时，保持 projectId 为 null
  
  conversationStore.openConversationInTab(newId)
  console.log('✅ 创建新对话并跳转:', newId)
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
  return projectStore.orderedProjects as ProjectRecord[]
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
  return projectStore.projectConversationCounts
})

const totalConversationCount = computed(() => (conversationStore.conversations as ConversationRecord[]).length)

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
  const project = projectStore.getProjectById(projectId)
  return project?.name ?? '未分配'
}

/**
 * ========================================
 * 🟡 中风险区域 - TODO 8: 搜索性能优化
 * ========================================
 * 
 * 当前问题:
 *   1. 每次过滤都需遍历所有对话的分支树 O(n*k*p)
 *      n = 对话数量, k = 分支数量, p = 每个版本的 parts 数量
 *   2. 无缓存机制，相同搜索词重复计算
 *   3. getBranch 每次都判断 Map/Object 类型
 * 
 * 优化策略:
 *   1. 使用 WeakMap 缓存已搜索的对话结果:
 *      const searchCache = new WeakMap<ConversationRecord, Map<string, boolean>>()
 *   2. 提前判断 branches 类型，避免每次都检测:
 *      const isMap = branchesSource instanceof Map
 *   3. 考虑将全文内容缓存到 conversation 对象上:
 *      conversation._searchableText (computed 时生成)
 *   4. 如果对话数 > 500，考虑使用 Web Worker
 * 
 * 重构后位置:
 *   - 提取到 composables/useConversationSearch.ts
 *   - 与 filteredConversations computed 一起迁移
 * ========================================
 */
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

/**
 * ========================================
 * TODO 1: 提取到 useConversationSearch composable
 * ========================================
 * 
 * 当前实现:
 *   - 使用 contentSearchRequestId 防止竞态条件 (旧请求覆盖新结果)
 *   - immediate: true 可能导致组件加载时触发不必要的搜索
 * 
 * 重构建议:
 *   1. 使用 AbortController 替代 requestId 机制:
 *      const abortController = new AbortController()
 *      signal: abortController.signal
 *   2. 添加 300ms debounce 减少搜索请求:
 *      watchDebounced([rawSearchQuery, searchInContent], ..., { debounce: 300 })
 *   3. 执行关键词高亮显示：
 *      highlight: true, 然后在 UI 中渲染 <mark> 标签
 *   4. 添加搜索结果缓存 (LRU)
 * ========================================
 */
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

/**
 * ========================================
 * 🟡 中风险区域 - TODO 8: 过滤计算性能优化
 * ========================================
 * 
 * 当前问题:
 *   1. 依赖 6 个响应式源，任何变化都触发全量重计算
 *   2. 嵌套 3 层过滤逻辑 + 排序，时间复杂度 O(n log n)
 *   3. conversationMatchesContent 每次都遍历树结构
 *   4. 1000+ 对话时可能出现明显卡顿
 * 
 * 优化策略:
 *   1. 项目筛选使用 Set 替代多次 !== 比较:
 *      const projectIds = projectFilter === 'all' ? null : 
 *        projectFilter === 'unassigned' ? new Set([undefined, null]) :
 *        new Set([projectFilter])
 *   2. 搜索匹配早期返回，减少不必要的 conversationMatchesContent 调用
 *   3. 考虑使用虚拟滚动 (vue-virtual-scroller)，只渲染可见项
 *   4. 分页或懒加载 (100 条/页)
 *   5. 将排序移到 store 中，避免每次 computed 都排序
 * 
 * 性能目标:
 *   - 100 条对话: < 10ms
 *   - 1000 条对话: < 50ms
 *   - 5000 条对话: < 200ms (with virtual scroll)
 * 
 * 重构后位置:
 *   - 计算逻辑移至 ConversationSidebar 父组件
 *   - 通过 props 传递给 ConversationListItems
 *   - 添加 performance.mark 监控计算时间
 * ========================================
 */
const filteredConversations = computed<ConversationRecord[]>(() => {
  const conversations = conversationStore.conversations as ConversationRecord[]
  const query = normalizedQuery.value
  const scopes = buildSearchScopes()

  const filtered = conversations.filter(conversation => {
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

  // 按创建时间降序排序，最新的对话显示在最前面
  return filtered.sort((a, b) => b.createdAt - a.createdAt)
})

watch(filteredConversations, (list) => {
  if (!hoverMenuId.value) {
    return
  }
  if (!list.some(conversation => conversation.id === hoverMenuId.value)) {
    closeContextMenu()
  }
})

const handleCreateProject = async () => {
  const createdId = await projectStore.createProject(newProjectName.value)
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

/**
 * ========================================
 * 🔴 高风险区域 - TODO 5: 重构 projectFilter 双向同步逻辑
 * ========================================
 * 
 * 当前问题:
 *   1. 使用全局标志位 projectSyncReady 防止循环触发，代码脆弱
 *   2. 双向 watch 可能在极端情况下导致无限循环
 *   3. projectStore.activeProjectId 和 projectFilter 存在状态不一致风险
 * 
 * 重构策略:
 *   1. 移除 projectSyncReady 标志位
 *   2. 改为单向数据流:
 *      projectStore.activeProjectId (Source of Truth)
 *        ↓
 *      ConversationSidebar.projectFilter (父组件状态)
 *        ↓
 *      ProjectManager props (子组件只读)
 *        ↓
 *      emit('update:projectFilter', value)
 *        ↓
 *      父组件调用 projectStore.setActiveProject()
 *   3. 使用 flush: 'post' 避免同步触发
 *   4. 添加 100ms 防抖保护
 * 
 * 测试要求:
 *   - 快速点击切换项目 10 次，验证状态同步正确
 *   - 验证浏览器刷新后项目筛选器状态恢复
 *   - 验证删除当前选中项目后自动切换到 'all'
 * ========================================
 */
let projectSyncReady = false

watch(
  () => projectStore.activeProjectId,
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
    projectStore.setActiveProject(null)
    return
  }
  projectStore.setActiveProject(next)
})

const cancelProjectEdit = () => {
  projectEditingId.value = null
  projectEditingName.value = ''
}

const confirmProjectRename = async (projectId: string) => {
  if (projectId === 'unassigned') {
    return
  }
  const result = await projectStore.renameProject(projectId, projectEditingName.value)
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

const confirmProjectDelete = async (projectId: string) => {
  if (projectId === 'unassigned') {
    return
  }
  const success = await projectStore.deleteProject(projectId)
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

/**
 * ========================================
 * 🔴 高风险区域 - TODO 6: 跨域操作方法
 * ========================================
 * 
 * 当前问题:
 *   1. 同时读取 conversationStore 和写入 projectStore (跨域操作)
 *   2. 调用 closeContextMenu() 影响菜单状态 (第三个域)
 *   3. 状态更新顺序不明确，可能导致 UI 闪烁
 * 
 * 重构策略:
 *   1. 将此方法移至 ConversationSidebar 父组件
 *   2. 通过 provide/inject 向子菜单组件提供回调:
 *      provide('assignProjectCallback', async (convId, projId) => { ... })
 *   3. 严格执行更新顺序:
 *      Step 1: hoverProjectMenuId.value = null (关闭子菜单)
 *      Step 2: await nextTick() (等待 DOM 更新)
 *      Step 3: projectStore.assignConversationToProject() (更新数据)
 *      Step 4: await nextTick() (等待 store 更新)
 *      Step 5: closeContextMenu() (关闭主菜单)
 *   4. 添加错误处理和 Loading 状态
 * 
 * 测试要求:
 *   - 分配项目后验证菜单正确关闭，无 Teleport DOM 残留
 *   - 验证对话卡片上的项目标签立即更新
 *   - 验证项目管理区域的对话计数实时更新
 *   - 测试分配失败场景 (如项目被删除)，菜单应保持打开并显示错误
 * ========================================
 */
const changeConversationProject = (conversationId: string, projectId: string | null) => {
  const conversations = conversationStore.conversations as ConversationRecord[]
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
    projectStore.removeConversationFromProject(conversationId)
  } else {
    const success = projectStore.assignConversationToProject(conversationId, projectId)
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
    const list = projectStore.projects as ProjectRecord[]
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
          <div v-if="projectEditingId !== project.id" class="flex items-center gap-1">
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
            conversationStore.activeTabId === conversation.id
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white hover:bg-gray-50 text-gray-700'
          ]"
        >
          <!-- 正常显示模式 -->
          <div v-if="editingId !== conversation.id && deletingId !== conversation.id" class="flex items-center justify-between">
            <div
              @click="conversationStore.openConversationInTab(conversation.id)"
              class="flex-1 min-w-0"
            >
              <div class="font-medium flex items-center gap-2">
                <div class="flex flex-col flex-1 min-w-0">
                  <span class="truncate">{{ conversation.title }}</span>
                  <div class="flex items-center gap-2 text-[11px]">
                    <!-- 状态标签 -->
                    <span
                      :class="[
                        'px-1.5 py-0.5 rounded',
                        conversationStore.activeTabId === conversation.id
                          ? getStatusBadgeClassActive(conversation.status)
                          : getStatusBadgeClass(conversation.status)
                      ]"
                    >
                      {{ getStatusLabel(conversation.status) }}
                    </span>
                    <!-- 项目标签 -->
                    <span
                      :class="[
                        conversationStore.activeTabId === conversation.id
                          ? 'text-blue-100'
                          : 'text-gray-500'
                      ]"
                      v-if="conversation.projectId"
                    >
                      {{ getProjectLabel(conversation.projectId) }}
                    </span>
                    <span
                      :class="[
                        conversationStore.activeTabId === conversation.id
                          ? 'text-blue-200'
                          : 'text-gray-400'
                      ]"
                      v-else
                    >
                      未分配
                    </span>
                  </div>
                </div>

                
                <!-- 生成状态指示器 -->
                <!-- 发送中：蓝色旋转图标 -->
                <svg
                  v-if="conversation.generationStatus === 'sending'"
                  class="w-4 h-4 flex-shrink-0 animate-spin"
                  :class="[
                    conversationStore.activeTabId === conversation.id
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
                    conversationStore.activeTabId === conversation.id
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
                    conversationStore.activeTabId === conversation.id
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
                    conversationStore.activeTabId === conversation.id
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
                  conversationStore.activeTabId === conversation.id
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
                    conversationStore.activeTabId === conversation.id ? 'text-white hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'
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
                      :disabled="isConversationGenerating(conversation)"
                      @click="!isConversationGenerating(conversation) && handleDelete(conversation)"
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
              <span :class="conversationStore.activeTabId === conversation.id ? 'text-white' : 'text-gray-700'">
                确定删除？
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click.stop="confirmDelete(conversation.id)"
                class="p-1.5 rounded transition-colors"
                :class="[
                  conversationStore.activeTabId === conversation.id
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
                  conversationStore.activeTabId === conversation.id
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
      <div v-if="conversationStore.conversations.length === 0" class="text-center text-gray-500 mt-12 px-4">
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
