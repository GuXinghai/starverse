/**
 * 附件处理 Composable
 * 
 * 封装文件/图片选择、去重检测、PDF 引擎管理等逻辑
 * 
 * 核心功能：
 * - 文件选择: handleSelectImage, handleSelectFile (集成 Electron API)
 * - 去重检测: isImageDuplicate, isFileDuplicate (SHA-256 哈希比对)
 * - PDF 引擎管理: selectPdfEngineOption, togglePdfEngineMenu
 * - 提示系统: showAttachmentAlert, clearAttachmentAlert
 * 
 * Electron 环境判断：
 * - 优先使用 electronApiBridge 的原生文件选择器
 * - 降级策略: 检测 isUsingElectronApiFallback 标志
 * - 用户提示: 在非 Electron 环境提示功能不可用
 */

import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { electronApiBridge, isUsingElectronApiFallback } from '../../utils/electronBridge'
import type { AttachmentFile } from '../useAttachmentManager'

// ========== 类型定义 ==========

/**
 * 附件提示类型
 * 
 * 用于显示文件上传相关的提示信息
 * - warning: 警告（如重复上传、环境不支持）
 * - error: 错误（如文件过大、选择失败）
 */
export type AttachmentAlert = {
  type: 'warning' | 'error'
  message: string
}

/**
 * PDF 引擎选项类型
 * 
 * - pdf-text: 免费的文本提取引擎
 * - mistral-ocr: Mistral 的 OCR 引擎（支持扫描件）
 * - native: 模型原生文件输入
 */
export type PdfEngineType = 'pdf-text' | 'mistral-ocr' | 'native'

/**
 * PDF 引擎选项列表
 * 
 * 导出供 ChatView 模板使用
 */
export const PDF_ENGINE_OPTIONS = [
  { 
    value: 'pdf-text', 
    label: 'PDF Text', 
    description: '免费文本提取引擎',
    detail: '适用于结构清晰、文本为主的 PDF 文档',
    cost: '免费',
    icon: '📄'
  },
  { 
    value: 'mistral-ocr', 
    label: 'Mistral OCR', 
    description: '支持扫描件和图片',
    detail: '使用 Mistral 的 OCR 技术，适合扫描文档或包含大量图片的 PDF',
    cost: '$2 / 1,000 页',
    icon: '🔍'
  },
  { 
    value: 'native', 
    label: 'Native', 
    description: '模型原生文件处理',
    detail: '仅适用于支持原生文件输入的模型，按输入 tokens 计费',
    cost: '按 tokens 计费',
    icon: '⚡'
  }
] as const

// ========== Composable 选项 ==========

export interface UseAttachmentHandlersOptions {
  /**
   * 当前对话 ID
   */
  conversationId: Ref<string>
  
  /**
   * 当前对话的 PDF 引擎选择
   */
  conversationPdfEngine: Ref<'pdf-text' | 'mistral-ocr' | 'native' | undefined>
  
  /**
   * 更新对话 PDF 引擎的回调
   */
  onUpdatePdfEngine: (engine: 'pdf-text' | 'mistral-ocr' | 'native') => void
  
  /**
   * 当前激活的全局 PDF 引擎偏好
   */
  lastUsedPdfEngine: Ref<'pdf-text' | 'mistral-ocr' | 'native'>
  
  /**
   * 更新全局 PDF 引擎偏好的回调
   */
  onUpdateLastUsedPdfEngine: (engine: 'pdf-text' | 'mistral-ocr' | 'native') => void
  
  /**
   * 待处理图片列表 (Data URI 数组)
   * 来自 useAttachmentManager
   */
  pendingAttachments: Ref<string[]>
  
  /**
   * 待处理文件列表 (结构化对象数组)
   * 来自 useAttachmentManager
   */
  pendingFiles: Ref<AttachmentFile[]>
  
  /**
   * attachmentManager 实例
   * 用于调用 getDataUriSizeInBytes 等工具方法
   */
  attachmentManager: {
    getDataUriSizeInBytes: (dataUri: string) => number
  }
  
  /**
   * 活动菜单状态访问器
   * 用于控制 PDF 引擎菜单的显示/隐藏
   */
  activeMenu: {
    get: () => string | null
    set: (value: string | null) => void
  }
}

export interface UseAttachmentHandlersReturn {
  // ========== 状态 ==========
  attachmentAlert: Ref<AttachmentAlert | null>
  selectedPdfEngine: Ref<PdfEngineType>
  selectedPdfEngineLabel: ComputedRef<string>
  
  // ========== 提示管理 ==========
  showAttachmentAlert: (type: AttachmentAlert['type'], message: string, duration?: number) => void
  clearAttachmentAlert: () => void
  
  // ========== 文件选择 ==========
  handleSelectImage: () => Promise<void>
  handleSelectFile: () => Promise<void>
  
  // ========== 去重检测 ==========
  isImageDuplicate: (dataUri: string) => Promise<boolean>
  isFileDuplicate: (fileData: { dataUrl: string; name: string; size: number }) => Promise<boolean>
  calculateDataUriHash: (dataUri: string) => Promise<string>
  
  // ========== PDF 引擎管理 ==========
  togglePdfEngineMenu: () => void
  selectPdfEngineOption: (value: PdfEngineType) => void
}

// ========== Composable 主函数 ==========

export function useAttachmentHandlers(
  options: UseAttachmentHandlersOptions
): UseAttachmentHandlersReturn {
  const { 
    conversationPdfEngine,
    onUpdatePdfEngine,
    lastUsedPdfEngine,
    onUpdateLastUsedPdfEngine,
    pendingAttachments, 
    pendingFiles, 
    attachmentManager, 
    activeMenu 
  } = options

  // ========== 状态管理 ==========

  /**
   * 附件提示状态
   * 
   * 用于显示文件上传相关的警告和错误信息
   * - 自动消失: 默认 3 秒后清除
   * - 手动消失: 传入 duration = -1 可禁用自动清除
   */
  const attachmentAlert = ref<AttachmentAlert | null>(null)

  /**
   * 选中的 PDF 引擎
   * 
   * 优先使用对话的 pdfEngine，如果不存在则使用全局偏好
   */
  const selectedPdfEngine = computed<PdfEngineType>({
    get: () => conversationPdfEngine.value || lastUsedPdfEngine.value,
    set: (value) => {
      onUpdatePdfEngine(value)
      onUpdateLastUsedPdfEngine(value)
    }
  })

  /**
   * PDF 引擎显示标签
   * 
   * 根据选中的引擎值，返回对应的中文标签
   */
  const selectedPdfEngineLabel = computed(() => {
    return PDF_ENGINE_OPTIONS.find(opt => opt.value === selectedPdfEngine.value)?.label || 'PDF Text'
  })

  // ========== 提示管理 ==========

  /**
   * 显示附件提示
   * 
   * @param type - 提示类型 ('warning' | 'error')
   * @param message - 提示消息内容
   * @param duration - 显示持续时间（毫秒），默认 3000，传入 -1 禁用自动消失
   */
  const showAttachmentAlert = (type: AttachmentAlert['type'], message: string, duration = 3000) => {
    attachmentAlert.value = { type, message }
    if (duration > 0) {
      setTimeout(() => {
        attachmentAlert.value = null
      }, duration)
    }
  }

  /**
   * 清除附件提示
   */
  const clearAttachmentAlert = () => {
    attachmentAlert.value = null
  }

  // ========== 哈希计算 ==========

  /**
   * 计算 Data URI 的 SHA-256 哈希值
   * 
   * 用途：精确检测文件内容是否重复
   * 
   * 工作原理：
   * 1. 提取 Data URI 的 base64 部分
   * 2. 解码为二进制数据 (Uint8Array)
   * 3. 使用 Web Crypto API 计算 SHA-256
   * 4. 转换为十六进制字符串
   * 
   * @param dataUri - Data URI 字符串
   * @returns 哈希值（64 字符的十六进制字符串）
   */
  const calculateDataUriHash = async (dataUri: string): Promise<string> => {
    try {
      // 提取 base64 数据部分
      const base64Data = dataUri.split(',')[1]
      if (!base64Data) return ''
      
      // 将 base64 转换为 Uint8Array
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // 计算 SHA-256 哈希
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      return hashHex
    } catch (error) {
      console.error('计算哈希失败:', error)
      return ''
    }
  }

  // ========== 去重检测 ==========

  /**
   * 检查图片是否已存在（去重）
   * 
   * 两级检测策略：
   * 1. 快速检查: 直接比较 Data URI 字符串 (O(n))
   * 2. 精确检查: 计算 SHA-256 哈希比较 (更慢但精确)
   * 
   * @param dataUri - 待检测的图片 Data URI
   * @returns 是否重复
   */
  const isImageDuplicate = async (dataUri: string): Promise<boolean> => {
    // 方法 1: 快速检查 - 直接比较 Data URI 字符串
    if (pendingAttachments.value.includes(dataUri)) {
      return true
    }
    
    // 方法 2: 精确检查 - 计算哈希值比较
    const newHash = await calculateDataUriHash(dataUri)
    if (!newHash) return false
    
    for (const existingDataUri of pendingAttachments.value) {
      const existingHash = await calculateDataUriHash(existingDataUri)
      if (existingHash === newHash) {
        return true
      }
    }
    
    return false
  }

  /**
   * 检查文件是否已存在（去重）
   * 
   * 两级检测策略：
   * 1. 快速检查: 比较文件名和大小 + 哈希验证
   * 2. 精确检查: 计算所有文件的哈希值比较
   * 
   * @param fileData - 待检测的文件数据
   * @returns 是否重复
   */
  const isFileDuplicate = async (fileData: { dataUrl: string; name: string; size: number }): Promise<boolean> => {
    // 方法 1: 快速检查 - 比较文件名和大小
    const quickMatch = pendingFiles.value.find(
      f => f.name === fileData.name && f.size === fileData.size
    )
    if (quickMatch) {
      // 进一步验证内容是否相同
      const quickHash = await calculateDataUriHash(quickMatch.dataUrl)
      const newHash = await calculateDataUriHash(fileData.dataUrl)
      if (quickHash === newHash) {
        return true
      }
    }
    
    // 方法 2: 精确检查 - 计算所有文件的哈希值
    const newHash = await calculateDataUriHash(fileData.dataUrl)
    if (!newHash) return false
    
    for (const existingFile of pendingFiles.value) {
      const existingHash = await calculateDataUriHash(existingFile.dataUrl)
      if (existingHash === newHash) {
        return true
      }
    }
    
    return false
  }

  // ========== 文件选择（Electron API 集成） ==========

  /**
   * 选择图片附件
   * 
   * 功能流程：
   * 1. 检查 Electron API 可用性
   * 2. 调用系统文件选择器
   * 3. 去重检测
   * 4. 文件大小验证（上限 10 MB）
   * 5. 添加到 pendingAttachments
   * 
   * Electron 环境判断：
   * - 优先使用 electronApiBridge.selectImage
   * - 检测 isUsingElectronApiFallback 判断是否降级
   * - 非 Electron 环境提示用户
   */
  const handleSelectImage = async () => {
    try {
      clearAttachmentAlert()
      
      // 检查 Electron API 可用性
      if (!electronApiBridge?.selectImage || isUsingElectronApiFallback) {
        showAttachmentAlert('warning', '当前环境不支持选择图片，请在桌面应用中使用此功能')
        console.warn('handleSelectImage: electronAPI bridge 不可用，已提示用户。')
        return
      }
      
      // 调用 Electron API 打开文件选择器
      const dataUri = await electronApiBridge.selectImage()
      
      // 用户取消选择
      if (!dataUri) {
        return
      }
      
      // 检查是否重复
      const isDuplicate = await isImageDuplicate(dataUri)
      if (isDuplicate) {
        showAttachmentAlert('warning', '该图片已添加，请勿重复上传')
        return
      }
      
      // 验证图片大小
      const sizeInBytes = attachmentManager.getDataUriSizeInBytes(dataUri)
      const sizeInMB = sizeInBytes / (1024 * 1024)
      
      const maxImageSizeMB = 10
      if (sizeInMB > maxImageSizeMB) {
        showAttachmentAlert('error', `图片文件过大（${sizeInMB.toFixed(2)} MB），请选择小于 ${maxImageSizeMB} MB 的图片`)
        return
      }
      
      // 直接添加到图片数组（Electron API 已返回 Data URI）
      pendingAttachments.value.push(dataUri)
      clearAttachmentAlert()
    } catch (error) {
      console.error('❌ 选择图片失败:', error)
      showAttachmentAlert('error', '选择图片失败，请重试')
    }
  }

  /**
   * 选择文件附件
   * 
   * 功能流程：
   * 1. 检查 Electron API 可用性
   * 2. 调用系统文件选择器（当前仅支持 PDF）
   * 3. 构建文件对象（包含 UUID、文件名、大小、MIME 类型）
   * 4. 去重检测
   * 5. 文件大小验证（上限 20 MB）
   * 6. 添加到 pendingFiles
   * 
   * Electron 环境判断：
   * - 优先使用 electronApiBridge.selectFile
   * - 检测 isUsingElectronApiFallback 判断是否降级
   * - 非 Electron 环境提示用户
   */
  const handleSelectFile = async () => {
    try {
      clearAttachmentAlert()
      
      if (!electronApiBridge?.selectFile || isUsingElectronApiFallback) {
        showAttachmentAlert('warning', '当前环境不支持文件上传，请在桌面应用中使用此功能')
        console.warn('handleSelectFile: electronAPI bridge 不可用，已提示用户。')
        return
      }

      const result = await electronApiBridge.selectFile({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultMimeType: 'application/pdf'
      })

      if (!result || !result.dataUrl) {
        return
      }

      // 构建文件对象
      const fileToAdd: AttachmentFile = {
        id: uuidv4(),
        name: result.filename || 'document.pdf',
        dataUrl: result.dataUrl,
        size: result.size || attachmentManager.getDataUriSizeInBytes(result.dataUrl),
        mimeType: result.mimeType || 'application/pdf'
      }

      // 检查是否重复
      const isDuplicate = await isFileDuplicate(fileToAdd)
      if (isDuplicate) {
        showAttachmentAlert('warning', '该文件已添加，请勿重复上传')
        return
      }

      // 验证文件大小
      const maxFileSizeMB = 20
      const sizeMB = fileToAdd.size / (1024 * 1024)
      if (sizeMB > maxFileSizeMB) {
        showAttachmentAlert('error', `文件过大（${sizeMB.toFixed(2)} MB），请选择小于 ${maxFileSizeMB} MB 的文件`)
        return
      }

      pendingFiles.value.push(fileToAdd)
      clearAttachmentAlert()
    } catch (error) {
      console.error('选择文件失败:', error)
      showAttachmentAlert('error', '选择文件失败，请重试')
    }
  }

  // ========== PDF 引擎管理 ==========

  /**
   * 切换 PDF 引擎菜单显示状态
   * 
   * 逻辑：
   * - 如果当前菜单是 'pdf'，则关闭
   * - 如果当前菜单不是 'pdf'，则打开
   */
  const togglePdfEngineMenu = () => {
    const current = activeMenu.get()
    activeMenu.set(current === 'pdf' ? null : 'pdf')
  }

  /**
   * 选择 PDF 引擎选项
   * 
   * @param value - 引擎类型
   */
  const selectPdfEngineOption = (value: PdfEngineType) => {
    selectedPdfEngine.value = value
    activeMenu.set(null)
  }

  // ========== 返回 API ==========

  return {
    // 状态
    attachmentAlert,
    selectedPdfEngine,
    selectedPdfEngineLabel,
    
    // 提示管理
    showAttachmentAlert,
    clearAttachmentAlert,
    
    // 文件选择
    handleSelectImage,
    handleSelectFile,
    
    // 去重检测
    isImageDuplicate,
    isFileDuplicate,
    calculateDataUriHash,
    
    // PDF 引擎管理
    togglePdfEngineMenu,
    selectPdfEngineOption
  }
}
