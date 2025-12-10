/**
 * 消息操作 Composable
 * 
 * 封装消息的编辑、删除、版本切换等操作逻辑
 * 
 * 核心功能：
 * - 消息编辑：handleEditMessage, handleSaveEdit, handleCancelEdit
 * - 图片/文件管理：handleRemoveEditingImage, handleAddImageToEdit, handleRemoveEditingFile, handleAddFileToEdit
 * - 版本切换：handleSwitchVersion
 * - 删除操作：handleDeleteClick, handleDeleteCurrentVersion, handleDeleteAllVersions
 * 
 * 依赖注入：
 * - performSendMessage: 用于编辑后重新生成 AI 回复
 * - conversationStore, branchStore: 状态管理
 * - 编辑状态来自 useMessageEditing composable
 */

import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { getCurrentVersion, getPathToBranch } from '../../stores/branchTreeHelpers'
import { electronApiBridge, isUsingElectronApiFallback } from '../../utils/electronBridge'

// ========== 类型定义 ==========

export interface UseMessageOperationsOptions {
  conversationId: Ref<string>
  performSendMessage: () => Promise<{ success: boolean; error?: string }>
  
  // Store 实例
  conversationStore: any
  branchStore: any
  
  // 编辑状态（来自 useMessageEditing）
  editingText: Ref<string>
  editingImages: Ref<string[]>
  editingFiles: Ref<any[]>
  startEditing: (branchId: string) => void
  cancelEditing: () => void
  removeImageFromEdit: (index: number) => void
  addImageToEdit: (dataUri: string) => void
  removeFileFromEdit: (fileId: string) => void
  addFileToEdit: (file: any) => void
  
  // 附件管理
  showAttachmentAlert: (type: 'error' | 'warning', message: string, duration?: number) => void
  attachmentManager: {
    getDataUriSizeInBytes: (dataUri: string) => number
  }
}

export interface UseMessageOperationsReturn {
  // 编辑操作
  handleEditMessage: (branchId: string, message: any) => void
  handleCancelEdit: () => void
  handleSaveEdit: (branchId: string) => Promise<void>
  
  // 编辑器图片/文件管理
  handleRemoveEditingImage: (index: number) => void
  handleAddImageToEdit: () => Promise<void>
  handleRemoveEditingFile: (fileId: string) => void
  handleAddFileToEdit: () => Promise<void>
  
  // 版本切换
  handleSwitchVersion: (branchId: string, direction: number) => void
  
  // 删除操作
  handleDeleteClick: (branchId: string) => void
  handleDeleteCurrentVersion: () => void
  handleDeleteAllVersions: () => void
  deletingBranchId: Ref<string | null>
  deleteDialogShow: Ref<boolean>
}

/**
 * 比较两个消息 parts 数组是否相等
 */
const areMessagePartsEqual = (partsA: any[] = [], partsB: any[] = []): boolean => {
  if (partsA.length !== partsB.length) return false
  
  for (let i = 0; i < partsA.length; i++) {
    const a = partsA[i]
    const b = partsB[i]
    
    if (a.type !== b.type) return false
    
    if (a.type === 'text') {
      if (a.text !== b.text) return false
    } else if (a.type === 'image_url') {
      if (a.image_url?.url !== b.image_url?.url) return false
    } else if (a.type === 'file') {
      if (a.file?.file_data !== b.file?.file_data) return false
    }
  }
  
  return true
}

// ========== Composable 主函数 ==========

export function useMessageOperations(options: UseMessageOperationsOptions): UseMessageOperationsReturn {
  const {
    conversationId,
    performSendMessage,
    conversationStore,
    branchStore,
    editingText,
    editingImages,
    editingFiles,
    startEditing,
    cancelEditing,
    removeImageFromEdit,
    addImageToEdit,
    removeFileFromEdit,
    addFileToEdit,
    showAttachmentAlert,
    attachmentManager
  } = options

  // ========== 删除状态 ==========
  const deletingBranchId = ref<string | null>(null)
  const deleteDialogShow = ref(false)

  // ========== 编辑操作 ==========

  /**
   * 开始编辑消息
   */
  const handleEditMessage = (branchId: string, _message: any) => {
    startEditing(branchId)
  }

  /**
   * 取消消息编辑
   */
  const handleCancelEdit = () => {
    cancelEditing()
  }

  /**
   * 移除编辑器中的图片
   */
  const handleRemoveEditingImage = (index: number) => {
    removeImageFromEdit(index)
  }

  /**
   * 移除编辑器中的文件
   */
  const handleRemoveEditingFile = (fileId: string) => {
    removeFileFromEdit(fileId)
  }

  /**
   * 在编辑器中添加图片
   */
  const handleAddImageToEdit = async () => {
    if (!electronApiBridge?.selectImage || isUsingElectronApiFallback) {
      showAttachmentAlert('warning', '图片选择功能在当前环境下不可用（需要 Electron 环境）')
      console.warn('handleAddImageToEdit: electronAPI bridge 不可用')
      return
    }
    
    try {
      const imageDataUri = await electronApiBridge.selectImage()
      if (imageDataUri) {
        addImageToEdit(imageDataUri)
      }
    } catch (error) {
      console.error('选择图片失败:', error)
    }
  }

  /**
   * 在编辑器中添加文件
   */
  const handleAddFileToEdit = async () => {
    if (!electronApiBridge?.selectFile || isUsingElectronApiFallback) {
      showAttachmentAlert('warning', '文件选择功能在当前环境下不可用（需要 Electron 环境）')
      console.warn('handleAddFileToEdit: electronAPI bridge 不可用')
      return
    }

    try {
      const result = await electronApiBridge.selectFile({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultMimeType: 'application/pdf'
      })
      if (result?.dataUrl) {
        const fileSizeBytes = typeof result.size === 'number' 
          ? result.size 
          : attachmentManager.getDataUriSizeInBytes(result.dataUrl)
        const sizeInMB = fileSizeBytes / (1024 * 1024)
        
        if (sizeInMB > 20) { // MAX_FILE_SIZE_MB
          showAttachmentAlert('error', `文件过大（${sizeInMB.toFixed(2)} MB），请选择小于 20 MB 的文件`)
          return
        }

        addFileToEdit({
          id: uuidv4(),
          name: result.filename || '附件',
          dataUrl: result.dataUrl,
          size: fileSizeBytes,
          mimeType: result.mimeType
        })
      }
    } catch (error) {
      console.error('选择文件失败:', error)
    }
  }

  /**
   * 保存编辑并重新提交
   */
  const handleSaveEdit = async (branchId: string) => {
    // 🔒 固化上下文
    const targetConversationId = conversationId.value
    
    const hasText = editingText.value.trim()
    const hasImages = editingImages.value.length > 0
    const hasFiles = editingFiles.value.length > 0
    
    // 必须有文本或图片或文件
    if (!hasText && !hasImages && !hasFiles) {
      handleCancelEdit()
      return
    }

    // 构建新的 parts 数组
    const newParts: any[] = []
    
    // 添加文本部分
    if (hasText) {
      newParts.push({
        type: 'text',
        text: editingText.value.trim()
      })
    }

    // 添加文件部分
    for (const file of editingFiles.value) {
      newParts.push({
        id: file.id,
        type: 'file',
        file: {
          filename: file.name,
          file_data: file.dataUrl,
          mime_type: file.mimeType,
          size_bytes: file.size
        }
      })
    }
    
    // 添加图片部分
    for (const imageDataUri of editingImages.value) {
      newParts.push({
        id: uuidv4(),
        type: 'image_url',
        image_url: {
          url: imageDataUri
        }
      })
    }

    // 获取对话的分支树
    const conversation = conversationStore.getConversationById(targetConversationId)
    if (!conversation?.tree) {
      console.error('对话或分支树不存在')
      return
    }

    const branch = conversation.tree.branches.get(branchId)
    if (!branch) {
      console.error(`找不到分支: ${branchId}`)
      return
    }

    const currentVersionSnapshot = getCurrentVersion(branch)
    const isUserBranch = branch.role === 'user'
    const childBranchIds: string[] = currentVersionSnapshot?.childBranchIds ?? []
    const emptyChildBranchIds: string[] = []
    let hasMeaningfulReply = false

    if (childBranchIds.length > 0 && conversation.tree) {
      for (const childId of childBranchIds) {
        const childBranch = conversation.tree.branches.get(childId)
        if (!childBranch || childBranch.role !== 'assistant') {
          continue
        }

        const childVersion = getCurrentVersion(childBranch)
        if (!childVersion) {
          continue
        }

        const hasContent = childVersion.parts.some((part: any) => {
          if (part.type === 'text') {
            return (part.text ?? '').trim().length > 0
          }
          if (part.type === 'image_url') {
            return Boolean(part.image_url?.url)
          }
          if (part.type === 'file') {
            return Boolean(part.file?.file_data)
          }
          return true
        })

        if (hasContent) {
          hasMeaningfulReply = true
        } else {
          emptyChildBranchIds.push(childId)
        }
      }
    }

    const hasActualChanges = !currentVersionSnapshot || !areMessagePartsEqual(currentVersionSnapshot.parts, newParts)
    const shouldTriggerReplyOnly = !hasActualChanges && isUserBranch && !hasMeaningfulReply

    if (!hasActualChanges && !shouldTriggerReplyOnly) {
      // 无实际改动且已有有效回复，直接退出编辑
      handleCancelEdit()
      return
    }

    if (shouldTriggerReplyOnly) {
      // 清理空的占位回复并回归当前路径到用户分支
      for (const emptyBranchId of emptyChildBranchIds) {
        branchStore.removeBranch(targetConversationId, emptyBranchId, true)
      }

      if (conversation.tree) {
        const normalizedPath = getPathToBranch(conversation.tree, branchId)
        if (normalizedPath.length > 0) {
          conversation.tree.currentPath = normalizedPath
        }
      }
    }

    if (hasActualChanges) {
      // 创建新版本（用户编辑的消息）
      // 🔧 编辑消息不继承子分支，避免旧回复和新回复同时出现
      console.log('🔍 [handleSaveEdit] 编辑前子分支:', {
        branchId,
        childBranchIds: currentVersionSnapshot?.childBranchIds || [],
        childCount: currentVersionSnapshot?.childBranchIds?.length || 0,
        willInherit: false
      })
      
      branchStore.addBranchVersion(targetConversationId, branchId, newParts, false)
      
      // 验证新版本的子分支状态
      const updatedBranch = branchStore.getBranch(targetConversationId, branchId)
      const newVersion = updatedBranch?.versions[updatedBranch.currentVersionIndex]
      console.log('✅ [handleSaveEdit] 编辑后子分支:', {
        branchId,
        childBranchIds: newVersion?.childBranchIds || [],
        childCount: newVersion?.childBranchIds?.length || 0,
        inheritChildren: false
      })
    }

    // 先退出编辑模式
    handleCancelEdit()
    
    // 等待 DOM 更新
    await nextTick()

    // 如果编辑的是用户消息，需要重新生成 AI 回复
    if (isUserBranch && (hasActualChanges || shouldTriggerReplyOnly)) {
      await performSendMessage()
    }
  }

  // ========== 版本切换 ==========

  /**
   * 切换消息分支版本
   */
  const handleSwitchVersion = (branchId: string, direction: number) => {
    const conversation = conversationStore.getConversationById(conversationId.value)
    if (!conversation) return
    branchStore.switchBranchVersion(conversation.id, branchId, direction as 1 | -1)
  }

  // ========== 删除操作 ==========

  /**
   * 打开删除确认对话框
   */
  const handleDeleteClick = (branchId: string) => {
    deletingBranchId.value = branchId
    deleteDialogShow.value = true
  }

  /**
   * 删除当前版本
   */
  const handleDeleteCurrentVersion = () => {
    if (!deletingBranchId.value) return
    const conversation = conversationStore.getConversationById(conversationId.value)
    if (!conversation) return
    
    branchStore.removeBranch(conversation.id, deletingBranchId.value, false)
    deletingBranchId.value = null
    deleteDialogShow.value = false
  }

  /**
   * 删除所有版本（删除整个分支）
   */
  const handleDeleteAllVersions = () => {
    if (!deletingBranchId.value) return
    const conversation = conversationStore.getConversationById(conversationId.value)
    if (!conversation) return
    
    branchStore.removeBranch(conversation.id, deletingBranchId.value, true)
    deletingBranchId.value = null
    deleteDialogShow.value = false
  }

  // ========== 返回 API ==========

  return {
    // 编辑操作
    handleEditMessage,
    handleCancelEdit,
    handleSaveEdit,
    
    // 编辑器图片/文件管理
    handleRemoveEditingImage,
    handleAddImageToEdit,
    handleRemoveEditingFile,
    handleAddFileToEdit,
    
    // 版本切换
    handleSwitchVersion,
    
    // 删除操作
    handleDeleteClick,
    handleDeleteCurrentVersion,
    handleDeleteAllVersions,
    deletingBranchId,
    deleteDialogShow
  }
}
