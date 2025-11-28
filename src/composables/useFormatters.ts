/**
 * ========================================
 * useFormatters - 格式化工具函数 Composable
 * ========================================
 * 
 * 提供纯函数用于格式化显示文本和样式类，完全无副作用
 * 
 * 功能:
 *   - getStatusLabel: 获取对话状态的文本标签
 *   - getStatusBadgeClass: 获取对话状态的普通样式类
 *   - getStatusBadgeClassActive: 获取对话状态的激活样式类
 *   - formatModelName: 格式化 AI 模型名称显示
 * 
 * 使用示例:
 *   const { getStatusLabel, formatModelName } = useFormatters()
 *   const label = getStatusLabel('active') // "活跃"
 *   const modelDisplay = formatModelName('openai/gpt-4') // "gpt-4"
 * ========================================
 */

import { CONVERSATION_STATUS_LABELS, DEFAULT_CONVERSATION_STATUS, type ConversationStatus } from '../types/conversation'

export function useFormatters() {
  /**
   * 获取对话状态的文本标签
   * @param status - 对话状态，可选
   * @returns 状态对应的中文标签
   */
  const getStatusLabel = (status?: ConversationStatus): string => {
    return CONVERSATION_STATUS_LABELS[status || DEFAULT_CONVERSATION_STATUS]
  }

  /**
   * 获取对话状态的普通样式类（用于未选中状态）
   * @param status - 对话状态，可选
   * @returns Tailwind CSS 类名字符串
   */
  const getStatusBadgeClass = (status?: ConversationStatus): string => {
    const actualStatus = status || DEFAULT_CONVERSATION_STATUS
    switch (actualStatus) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'completed':
        return 'bg-blue-100 text-blue-700'
      case 'archived':
        return 'bg-gray-100 text-gray-600'
      case 'draft':
      default:
        return 'bg-yellow-100 text-yellow-700'
    }
  }

  /**
   * 获取对话状态的激活样式类（用于选中状态）
   * @param status - 对话状态，可选
   * @returns Tailwind CSS 类名字符串
   */
  const getStatusBadgeClassActive = (status?: ConversationStatus): string => {
    const actualStatus = status || DEFAULT_CONVERSATION_STATUS
    switch (actualStatus) {
      case 'active':
        return 'bg-green-200 text-green-800'
      case 'completed':
        return 'bg-blue-200 text-blue-800'
      case 'archived':
        return 'bg-gray-200 text-gray-700'
      case 'draft':
      default:
        return 'bg-yellow-200 text-yellow-800'
    }
  }

  /**
   * 格式化 AI 模型名称以便显示
   * @param modelName - 完整的模型名称（如 "openai/gpt-4", "gemini-1.5-pro"）
   * @returns 简化后的模型名称
   * 
   * 处理逻辑:
   *   - Gemini 模型: 提取 "gemini-x.x-xxxx" 格式
   *   - 其他模型: 取最后一个 "/" 后的部分
   */
  const formatModelName = (modelName: string): string => {
    // 匹配 Gemini 模型格式 (如 gemini-1.5-pro)
    const geminiMatch = modelName.match(/gemini-[\d.]+-[\w]+/)
    if (geminiMatch) {
      return geminiMatch[0]
    }
    
    // 对于其他模型，取最后一个斜杠后的部分
    const parts = modelName.split('/')
    return parts[parts.length - 1]
  }

  return {
    getStatusLabel,
    getStatusBadgeClass,
    getStatusBadgeClassActive,
    formatModelName
  }
}
