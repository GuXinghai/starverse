/**
 * useAttachmentManager - 附件管理 Composable
 * 
 * 职责：
 * - 图片选择和预览
 * - 文件选择和预览
 * - 附件大小限制验证
 * - 附件格式转换（File → Data URI）
 */

import { ref } from 'vue'

export interface AttachmentFile {
  id: string
  name: string
  dataUrl: string
  size: number
  mimeType?: string
}

export interface AttachmentManagerOptions {
  maxImageSizeMB?: number
  maxFileSizeMB?: number
  maxImagesPerMessage?: number
  maxFilesPerMessage?: number
}

export function useAttachmentManager(options: AttachmentManagerOptions = {}) {
  const {
    maxImageSizeMB = 10,
    maxFileSizeMB = 20,
    maxImagesPerMessage = 5,
    maxFilesPerMessage = 3
  } = options

  // 图片附件列表（Data URI 格式）
  const images = ref<string[]>([])
  
  // 文件附件列表
  const files = ref<AttachmentFile[]>([])

  /**
   * 将 File 对象转换为 Data URI
   */
  function fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  /**
   * 获取 Data URI 的字节大小
   */
  function getDataUriSizeInBytes(dataUri: string): number {
    // Data URI 格式：data:[<mime>];base64,<data>
    const base64Data = dataUri.split(',')[1]
    if (!base64Data) return 0
    
    // Base64 编码会增大约 33%
    const padding = (base64Data.match(/=/g) || []).length
    return ((base64Data.length * 3) / 4) - padding
  }

  /**
   * 添加图片附件
   */
  async function addImages(fileList: FileList | File[]): Promise<{ success: boolean; error?: string }> {
    const filesArray = Array.from(fileList)

    // 检查数量限制
    if (images.value.length + filesArray.length > maxImagesPerMessage) {
      return {
        success: false,
        error: `最多只能添加 ${maxImagesPerMessage} 张图片`
      }
    }

    try {
      for (const file of filesArray) {
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
          return {
            success: false,
            error: `文件 ${file.name} 不是图片格式`
          }
        }

        // 检查文件大小
        const sizeMB = file.size / (1024 * 1024)
        if (sizeMB > maxImageSizeMB) {
          return {
            success: false,
            error: `图片 ${file.name} 过大（${sizeMB.toFixed(2)} MB），请选择小于 ${maxImageSizeMB} MB 的图片`
          }
        }

        // 转换为 Data URI
        const dataUri = await fileToDataUri(file)
        images.value.push(dataUri)
      }

      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || '图片读取失败'
      }
    }
  }

  /**
   * 添加文件附件
   */
  async function addFiles(fileList: FileList | File[]): Promise<{ success: boolean; error?: string }> {
    const filesArray = Array.from(fileList)

    // 检查数量限制
    if (files.value.length + filesArray.length > maxFilesPerMessage) {
      return {
        success: false,
        error: `最多只能添加 ${maxFilesPerMessage} 个文件`
      }
    }

    try {
      for (const file of filesArray) {
        // 检查文件大小
        const sizeMB = file.size / (1024 * 1024)
        if (sizeMB > maxFileSizeMB) {
          return {
            success: false,
            error: `文件 ${file.name} 过大（${sizeMB.toFixed(2)} MB），请选择小于 ${maxFileSizeMB} MB 的文件`
          }
        }

        // 转换为 Data URI
        const dataUri = await fileToDataUri(file)
        
        files.value.push({
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl: dataUri,
          size: file.size,
          mimeType: file.type
        })
      }

      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || '文件读取失败'
      }
    }
  }

  /**
   * 移除图片附件
   */
  function removeImage(index: number) {
    if (index >= 0 && index < images.value.length) {
      images.value.splice(index, 1)
    }
  }

  /**
   * 移除文件附件
   */
  function removeFile(fileId: string) {
    const index = files.value.findIndex(f => f.id === fileId)
    if (index >= 0) {
      files.value.splice(index, 1)
    }
  }

  /**
   * 清空所有附件
   */
  function clearAll() {
    images.value = []
    files.value = []
  }

  /**
   * 格式化文件大小显示
   */
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  return {
    // 状态
    images,
    files,
    
    // 计算属性
    hasAttachments: () => images.value.length > 0 || files.value.length > 0,
    totalCount: () => images.value.length + files.value.length,
    
    // 方法
    addImages,
    addFiles,
    removeImage,
    removeFile,
    clearAll,
    formatFileSize,
    fileToDataUri,
    getDataUriSizeInBytes
  }
}
