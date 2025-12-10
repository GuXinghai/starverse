/**
 * Textarea 控制 Composable
 * 
 * 封装 textarea 的所有交互逻辑
 * 
 * 核心功能：
 * - 自动高度调整
 * - 聚焦控制（内部 vs 外部调用）
 * - 激活状态检查
 * 
 * 设计原则：
 * - 区分内部和外部聚焦逻辑
 * - 与组件激活状态集成
 * - RAF 优化确保 DOM 就绪
 */

import { watch, nextTick } from 'vue'
import type { Ref } from 'vue'

// ========== 类型定义 ==========

export interface UseTextareaControlOptions {
  textareaRef: Ref<HTMLTextAreaElement | null>
  draftInput: Ref<string>
  isComponentActive: Ref<boolean>
}

export interface UseTextareaControlReturn {
  adjustTextareaHeight: () => void
  focusInput: () => void
  focusTextarea: () => void
}

// ========== Composable 实现 ==========

export function useTextareaControl(options: UseTextareaControlOptions): UseTextareaControlReturn {
  const { textareaRef, draftInput, isComponentActive } = options
  
  /**
   * 自动调整 Textarea 高度
   * 
   * 功能：根据内容动态调整输入框高度
   * 
   * 实现逻辑：
   * 1. 重置高度为 'auto' 获取准确的 scrollHeight
   * 2. 设置最大高度为 200px（超过则显示滚动条）
   * 3. 根据内容高度设置实际高度
   * 
   * 触发时机：
   * - 用户输入文本（watch draftInput）
   * - 粘贴内容
   * - 组件挂载后（初始化）
   */
  const adjustTextareaHeight = () => {
    if (!textareaRef.value) return
    
    // 重置高度以获取准确的scrollHeight
    textareaRef.value.style.height = 'auto'
    
    // 设置最大高度为200px
    const maxHeight = 200
    const scrollHeight = textareaRef.value.scrollHeight
    
    if (scrollHeight > maxHeight) {
      textareaRef.value.style.height = `${maxHeight}px`
      textareaRef.value.style.overflowY = 'auto'
    } else {
      textareaRef.value.style.height = `${scrollHeight}px`
      textareaRef.value.style.overflowY = 'hidden'
    }
  }
  
  /**
   * 聚焦输入框（暴露给父组件的公共方法）
   * 
   * 适用场景：
   * - 父组件通过 ref 调用：chatViewRef.value.focusInput()
   * - 标签页切换时的自动聚焦
   * - 用户点击对话列表切换对话
   * 
   * 实现策略：
   * - 检查文档焦点状态（避免抢夺其他窗口的焦点）
   * - 使用 requestAnimationFrame 确保 DOM 就绪
   * - 比 setTimeout(fn, 0) 更精确，与浏览器渲染周期同步
   * 
   * 注意：
   * - 此函数通过 defineExpose 暴露给父组件
   * - 父组件使用 ref 调用：chatViewRef.value.focusInput()
   */
  const focusInput = () => {
    // 检查文档是否有焦点（窗口是否激活）
    if (!document.hasFocus()) {
      return
    }
    
    if (!textareaRef.value) {
      // DOM 未就绪，延迟到下一帧重试
      requestAnimationFrame(() => {
        if (textareaRef.value) {
          textareaRef.value.focus()
        } else {
          console.error('❌ 延迟聚焦失败：textareaRef 仍为空')
        }
      })
      return
    }
    
    // 立即尝试聚焦
    textareaRef.value.focus()
  }
  
  /**
   * 内部聚焦方法（用于组件内部调用）
   * 
   * 与 focusInput 的区别：
   * - focusInput: 暴露给父组件，可在任何时候调用
   * - focusTextarea: 仅供组件内部使用，会检查激活状态
   * 
   * 激活状态检查：
   * - 只有当前组件处于激活状态时才聚焦
   * - 避免后台标签页抢夺焦点
   * - 多实例架构的关键优化
   */
  const focusTextarea = () => {
    if (!isComponentActive.value) {
      return
    }
    focusInput()
  }
  
  // 监听输入内容变化，自动调整高度
  watch(draftInput, () => {
    nextTick(() => adjustTextareaHeight())
  })
  
  return {
    adjustTextareaHeight,
    focusInput,
    focusTextarea
  }
}
