/**
 * useMessageEditing - 消息编辑 Composable
 * 
 * 职责：
 * - 进入/退出编辑模式
 * - 编辑状态管理
 * - 保存编辑并重新生成
 */

import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { MessagePart } from '@/types/chat'
import { useBranchStore } from '@/stores/branch'
import { useConversationStore } from '@/stores/conversation'
import type { AttachmentFile } from './useAttachmentManager'

export interface MessageEditingOptions {
  conversationId: string
}

export function useMessageEditing(options: MessageEditingOptions) {
  const branchStore = useBranchStore()
  const conversationStore = useConversationStore()

  // 编辑状态
  const isEditing = ref(false)
  const editingBranchId = ref<string | null>(null)
  const editingText = ref('')
  const editingImages = ref<string[]>([])
  const editingFiles = ref<AttachmentFile[]>([])

  /**
   * 进入编辑模式
   */
  function startEditing(branchId: string) {
    const conversation = conversationStore.conversations.find(
      c => c.id === options.conversationId
    )
    
    if (!conversation?.tree) {
      console.error('[useMessageEditing] 未找到对话')
      return
    }

    const branch = conversation.tree.branches.get(branchId)
    if (!branch) {
      console.error('[useMessageEditing] 未找到分支')
      return
    }

    // 获取当前版本
    const currentVersion = branch.versions[branch.currentVersionIndex]
    if (!currentVersion || !currentVersion.parts) {
      console.error('[useMessageEditing] 未找到当前版本或 parts')
      return
    }

    // 提取文本、图片、文件
    const textParts = currentVersion.parts.filter((p: any) => p.type === 'text')
    const imageParts = currentVersion.parts.filter((p: any) => p.type === 'image_url')
    const fileParts = currentVersion.parts.filter((p: any) => p.type === 'file' && p.file?.file_data)

    editingText.value = textParts.map((p: any) => p.text).join('\n')
    editingImages.value = imageParts.map((p: any) => p.image_url.url)
    editingFiles.value = fileParts.map((p: any) => ({
      id: p.id || uuidv4(),
      name: p.file?.filename || '附件',
      dataUrl: p.file?.file_data,
      size: typeof p.file?.size_bytes === 'number' ? p.file.size_bytes : 0,
      mimeType: p.file?.mime_type
    }))

    editingBranchId.value = branchId
    isEditing.value = true
  }

  /**
   * 取消编辑
   */
  function cancelEditing() {
    isEditing.value = false
    editingBranchId.value = null
    editingText.value = ''
    editingImages.value = []
    editingFiles.value = []
  }

  /**
   * 构建编辑后的消息 parts
   */
  function buildEditedMessageParts(): MessagePart[] {
    const parts: MessagePart[] = []

    // 添加文本部分
    if (editingText.value.trim()) {
      parts.push({
        type: 'text',
        text: editingText.value.trim()
      })
    }

    // 添加文件部分
    for (const file of editingFiles.value) {
      parts.push({
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
      parts.push({
        id: uuidv4(),
        type: 'image_url',
        image_url: {
          url: imageDataUri
        }
      })
    }

    return parts
  }

  /**
   * 保存编辑（创建新版本）
   */
  function saveEdit(): { success: boolean; newVersionId?: string; error?: string } {
    if (!editingBranchId.value) {
      return { success: false, error: '未找到编辑的分支' }
    }

    const hasText = editingText.value.trim()
    const hasImages = editingImages.value.length > 0
    const hasFiles = editingFiles.value.length > 0

    // 必须有文本、图片或文件
    if (!hasText && !hasImages && !hasFiles) {
      return { success: false, error: '消息不能为空' }
    }

    try {
      // 构建新的 parts
      const newParts = buildEditedMessageParts()

      // 添加新版本到分支
      const newVersionId = branchStore.addBranchVersion(
        options.conversationId,
        editingBranchId.value,
        newParts
      )

      // 清除编辑状态
      cancelEditing()

      return { success: true, newVersionId }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || '保存失败'
      }
    }
  }

  /**
   * 添加图片到编辑器
   */
  function addImageToEdit(imageDataUri: string) {
    editingImages.value.push(imageDataUri)
  }

  /**
   * 移除编辑器中的图片
   */
  function removeImageFromEdit(index: number) {
    if (index >= 0 && index < editingImages.value.length) {
      editingImages.value.splice(index, 1)
    }
  }

  /**
   * 添加文件到编辑器
   */
  function addFileToEdit(file: AttachmentFile) {
    editingFiles.value.push(file)
  }

  /**
   * 移除编辑器中的文件
   */
  function removeFileFromEdit(fileId: string) {
    const index = editingFiles.value.findIndex(f => f.id === fileId)
    if (index >= 0) {
      editingFiles.value.splice(index, 1)
    }
  }

  return {
    // 状态
    isEditing,
    editingBranchId,
    editingText,
    editingImages,
    editingFiles,

    // 方法
    startEditing,
    cancelEditing,
    saveEdit,
    buildEditedMessageParts,
    addImageToEdit,
    removeImageFromEdit,
    addFileToEdit,
    removeFileFromEdit
  }
}
