/**
 * 菜单控制 Composable
 * 
 * 封装所有菜单的打开/关闭逻辑
 * 
 * 核心功能：
 * - Web 搜索菜单切换
 * - 推理控制菜单切换
 * - 采样参数菜单切换（含参数校验）
 * - 全局点击检测（关闭菜单）
 * - 全局键盘快捷键
 * 
 * 设计原则：
 * - 统一菜单状态管理（activeMenu）
 * - 点击外部自动关闭
 * - 参数校验集成（采样菜单）
 */

import { watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { ActiveMenu } from './useUIState'
import type { ParameterValidationError } from '../useSamplingParameters'

// ========== 类型定义 ==========

export interface UseMenuControlOptions {
  // 状态
  activeMenu: Ref<ActiveMenu>
  conversationId: Ref<string>
  isComponentActive: Ref<boolean>
  
  // DOM 引用
  webSearchControlRef: Ref<HTMLElement | null>
  reasoningControlRef: Ref<HTMLElement | null>
  parameterControlRef: Ref<HTMLElement | null>
  pdfEngineMenuRef: Ref<HTMLElement | null>
  
  // 功能可用性
  isWebSearchAvailable: ComputedRef<boolean>
  isReasoningControlAvailable: ComputedRef<boolean>
  isReasoningEnabled: ComputedRef<boolean>
  isSamplingControlAvailable: ComputedRef<boolean>
  isSamplingEnabled: ComputedRef<boolean>
  
  // 当前对话
  currentConversation: ComputedRef<any>
  
  // 采样参数校验
  validateAllParameters: () => ParameterValidationError[]
  
  // 附件/文件选择（用于快捷键）
  handleSelectImage: () => void
  handleSelectFile: () => void
  
  // 聚焦控制（用于快捷键）
  focusInput: () => void
}

export interface UseMenuControlReturn {
  toggleWebSearchMenu: (event: MouseEvent) => void
  toggleReasoningMenu: (event: MouseEvent) => void
  toggleSamplingMenu: (event: MouseEvent) => void
  handleGlobalClick: (event: MouseEvent) => void
  handleGlobalKeyDown: (event: KeyboardEvent) => void
}

// ========== Composable 实现 ==========

export function useMenuControl(options: UseMenuControlOptions): UseMenuControlReturn {
  const {
    activeMenu,
    conversationId,
    isComponentActive,
    webSearchControlRef,
    reasoningControlRef,
    parameterControlRef,
    pdfEngineMenuRef,
    isWebSearchAvailable,
    isReasoningControlAvailable,
    isReasoningEnabled,
    isSamplingControlAvailable,
    isSamplingEnabled,
    currentConversation,
    validateAllParameters,
    handleSelectImage,
    handleSelectFile,
    focusInput
  } = options
  
  /**
   * 切换 Web 搜索级别菜单显示/隐藏
   * 
   * @param event - 鼠标事件（用于阻止冒泡）
   */
  const toggleWebSearchMenu = (event: MouseEvent) => {
    event.stopPropagation()
    if (!isWebSearchAvailable.value) {
      return
    }
    if (!currentConversation.value) {
      return
    }
    activeMenu.value = activeMenu.value === 'websearch' ? null : 'websearch'
  }
  
  /**
   * 切换推理控制菜单显示/隐藏
   * 
   * @param event - 鼠标事件（用于阻止冒泡）
   */
  const toggleReasoningMenu = (event: MouseEvent) => {
    event.stopPropagation()
    if (!isReasoningControlAvailable.value || !currentConversation.value) {
      activeMenu.value = null
      return
    }
    activeMenu.value = activeMenu.value === 'reasoning' ? null : 'reasoning'
  }
  
  /**
   * 切换采样参数菜单显示/隐藏
   * 
   * 特殊逻辑：关闭时需要校验参数
   * - 如果参数无效，阻止关闭，保持面板打开
   * - 提示用户修正错误
   * 
   * @param event - 鼠标事件（用于阻止冒泡）
   */
  const toggleSamplingMenu = (event: MouseEvent) => {
    event.stopPropagation()
    if (!isSamplingControlAvailable.value || !currentConversation.value) {
      activeMenu.value = null
      return
    }
    
    // 如果是关闭菜单，先校验参数
    if (activeMenu.value === 'sampling') {
      if (isSamplingEnabled.value) {
        const errors = validateAllParameters()
        if (errors.length > 0) {
          console.warn('参数校验失败，无法关闭面板:', errors)
          // 阻止关闭，保持面板打开
          return
        }
      }
      activeMenu.value = null
    } else {
      activeMenu.value = 'sampling'
    }
  }
  
  /**
   * 处理全局点击事件（用于关闭菜单）
   * 
   * 点击菜单外部时关闭菜单
   * 
   * @param event - 鼠标事件
   */
  const handleGlobalClick = (event: MouseEvent) => {
    if (activeMenu.value === null) return
    
    const targetNode = event.target instanceof Node ? event.target : null
    if (!targetNode) {
      activeMenu.value = null
      return
    }

    // 根据activeMenu检查对应的ref
    let shouldClose = false
    
    if (activeMenu.value === 'websearch' && webSearchControlRef.value) {
      shouldClose = !webSearchControlRef.value.contains(targetNode)
    } else if (activeMenu.value === 'reasoning' && reasoningControlRef.value) {
      shouldClose = !reasoningControlRef.value.contains(targetNode)
    } else if (activeMenu.value === 'sampling' && parameterControlRef.value) {
      shouldClose = !parameterControlRef.value.contains(targetNode)
      
      // 如果要关闭采样参数面板，先校验
      if (shouldClose && isSamplingEnabled.value && isSamplingControlAvailable.value) {
        const errors = validateAllParameters()
        if (errors.length > 0) {
          console.warn('参数校验失败，无法关闭面板:', errors)
          return // 阻止关闭
        }
      }
    } else if (activeMenu.value === 'pdf' && pdfEngineMenuRef.value) {
      shouldClose = !pdfEngineMenuRef.value.contains(targetNode)
    }
    
    if (shouldClose) {
      activeMenu.value = null
    }
  }
  
  /**
   * 全局键盘快捷键处理器
   * 
   * 支持的快捷键：
   * - Ctrl+K: 聚焦输入框
   * - Ctrl+Shift+I: 添加图片
   * - Ctrl+Shift+F: 添加文件
   * - Escape: 关闭所有菜单
   */
  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    // 只在当前组件激活时响应全局快捷键
    if (!isComponentActive.value) return
    
    // Ctrl+K: 聚焦输入框
    if (event.ctrlKey && event.key === 'k') {
      event.preventDefault()
      focusInput()
      return
    }
    
    // Ctrl+Shift+I: 添加图片
    if (event.ctrlKey && event.shiftKey && event.key === 'I') {
      event.preventDefault()
      if (currentConversation.value?.generationStatus === 'idle') {
        handleSelectImage()
      }
      return
    }
    
    // Ctrl+Shift+F: 添加文件
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault()
      if (currentConversation.value?.generationStatus === 'idle') {
        handleSelectFile()
      }
      return
    }
    
    // Escape: 关闭所有菜单（全局）
    if (event.key === 'Escape' && activeMenu.value !== null) {
      event.preventDefault()
      activeMenu.value = null
    }
  }
  
  // 统一的菜单状态管理：当对话切换或相关功能不可用时自动关闭菜单
  watch(
    [
      conversationId,
      isWebSearchAvailable,
      isReasoningControlAvailable,
      isReasoningEnabled,
      isSamplingControlAvailable,
      isSamplingEnabled
    ],
    (
      [currentConvId, webSearchAvail, reasoningAvail, reasoningEnabled, samplingAvail, samplingEnabled],
      [prevConvId]
    ) => {
      // 对话切换时关闭所有菜单
      if (currentConvId !== prevConvId) {
        activeMenu.value = null
        return
      }
      
      // 根据功能可用性自动关闭对应菜单
      if (!webSearchAvail && activeMenu.value === 'websearch') activeMenu.value = null
      if ((!reasoningAvail || !reasoningEnabled) && activeMenu.value === 'reasoning') activeMenu.value = null
      if ((!samplingAvail || !samplingEnabled) && activeMenu.value === 'sampling') activeMenu.value = null
    }
  )
  
  return {
    toggleWebSearchMenu,
    toggleReasoningMenu,
    toggleSamplingMenu,
    handleGlobalClick,
    handleGlobalKeyDown
  }
}
