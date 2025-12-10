/**
 * 图片操作 Composable
 * 
 * 封装图片相关的 UI 交互逻辑
 * 
 * 核心功能：
 * - 图片点击打开: handleImageClick (支持 Electron 原生查看器 + 浏览器降级)
 * - 图片下载: handleDownloadImage (支持 Data URI 和 HTTP(S) URL)
 * - 图片加载错误处理: handleImageLoadError
 * - 文件名生成: generateImageFilename (时间戳 + 随机数)
 * 
 * Electron 集成：
 * - 优先使用 electronApiBridge.openImage 打开系统默认查看器
 * - 失败时降级到浏览器的 window.open
 */

import { electronApiBridge } from '../../utils/electronBridge'

// ========== Composable 返回类型 ==========

export interface UseImageActionsReturn {
  handleImageClick: (imageUrl: string) => Promise<void>
  handleDownloadImage: (imageUrl: string, filename?: string) => Promise<void>
  handleImageLoadError: (event: Event) => void
  generateImageFilename: () => string
}

// ========== Composable 主函数 ==========

/**
 * 图片操作 Composable
 * 
 * 无需参数，提供纯函数式的图片操作 API
 */
export function useImageActions(): UseImageActionsReturn {
  
  // ========== 文件名生成 ==========

  /**
   * 生成图片文件名（带时间戳）
   * 
   * 格式：YY-MM-DD_HH-MM-RR.jpg
   * - YY: 年份后两位（25 表示 2025）
   * - MM: 月份（01-12）
   * - DD: 日期（01-31）
   * - HH: 小时（00-23）
   * - MM: 分钟（00-59）
   * - RR: 2位随机数（00-99，避免文件名冲突）
   * 
   * 设计考虑：
   * - 使用短格式节省文件名长度
   * - 使用下划线和连字符提高可读性
   * - 添加随机数避免同一分钟内的冲突
   * - 固定使用 .jpg 后缀（通用性好）
   * 
   * @returns 生成的文件名字符串
   * 
   * @example
   * generateImageFilename()
   * // => "25-11-09_14-30-42.jpg"
   */
  const generateImageFilename = () => {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const random = String(Math.floor(Math.random() * 100)).padStart(2, '0')
    
    return `${yy}-${mm}-${dd}_${hh}-${min}-${random}.jpg`
  }

  // ========== 图片点击处理 ==========

  /**
   * 点击图片时打开图片
   * 
   * 优先级策略：
   * 1. Electron 桌面应用: 使用系统默认图片查看器
   * 2. 网页版/失败降级: 使用浏览器新标签页打开
   * 
   * Electron API 调用：
   * - electronApiBridge.openImage(imageUrl)
   * - 返回 { success: boolean, error?: string }
   * 
   * 降级场景：
   * - Electron API 不可用
   * - Electron API 调用失败
   * - Electron API 返回 success: false
   * 
   * @param imageUrl - 图片 URL（可以是 HTTP(S) URL 或 Base64 Data URI）
   * 
   * @example
   * // 打开远程图片
   * handleImageClick('https://example.com/image.jpg')
   * 
   * @example
   * // 打开 Base64 图片
   * handleImageClick('data:image/png;base64,iVBORw0KGgo...')
   */
  const handleImageClick = async (imageUrl: string) => {
    // 优先使用 Electron API（桌面应用）
    if (electronApiBridge.openImage) {
      try {
        const result = await electronApiBridge.openImage(imageUrl)
        if (!result.success) {
          console.error('❌ 使用系统应用打开图片失败:', result.error)
          // 失败时降级到浏览器打开
          window.open(imageUrl, '_blank')
        }
      } catch (error) {
        console.error('❌ 调用 Electron API 失败:', error)
        // 出错时降级到浏览器打开
        window.open(imageUrl, '_blank')
      }
    } else {
      // 如果不在 Electron 环境（如网页版），使用浏览器打开
      window.open(imageUrl, '_blank')
    }
  }

  // ========== 图片下载 ==========

  /**
   * 下载图片到本地
   * 
   * 功能：用户点击"下载"按钮时调用
   * 
   * 支持的图片格式：
   * - Data URI（Base64 编码）：直接下载
   * - HTTP(S) URL：先 fetch 获取，再下载
   * 
   * 实现细节：
   * 1. Data URI 下载：
   *    - 创建临时 <a> 标签
   *    - 设置 href 为 Data URI
   *    - 设置 download 属性为文件名
   *    - 模拟点击触发下载
   *    - 下载后移除临时标签
   * 
   * 2. HTTP(S) URL 下载：
   *    - 使用 fetch 获取图片数据
   *    - 转换为 Blob 对象
   *    - 创建临时 Object URL
   *    - 使用 <a> 标签下载
   *    - 下载后释放 Object URL（避免内存泄漏）
   * 
   * 错误处理：
   * - 捕获所有异常（网络错误、CORS 限制等）
   * - 显示友好提示："下载图片失败，请尝试右键点击图片另存为"
   * - 记录错误日志用于调试
   * 
   * @param imageUrl - 图片 URL（Data URI 或 HTTP(S) URL）
   * @param filename - 可选的文件名（默认使用时间戳生成）
   * 
   * @example
   * // 下载远程图片（自动生成文件名）
   * handleDownloadImage('https://example.com/image.jpg')
   * 
   * @example
   * // 下载 Base64 图片（指定文件名）
   * handleDownloadImage('data:image/png;base64,...', 'screenshot.png')
   */
  const handleDownloadImage = async (imageUrl: string, filename?: string) => {
    try {
      // 使用新的命名格式（如果未指定文件名）
      const downloadFilename = filename || generateImageFilename()
      
      // 如果是 data URI，直接下载
      if (imageUrl.startsWith('data:')) {
        const link = document.createElement('a')
        link.href = imageUrl
        link.download = downloadFilename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        // 如果是 HTTP(S) URL，需要先 fetch 然后下载
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        const link = document.createElement('a')
        link.href = url
        link.download = downloadFilename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // 释放 blob URL（重要：避免内存泄漏）
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('❌ 下载图片失败:', error)
      alert('下载图片失败，请尝试右键点击图片另存为')
    }
  }

  // ========== 图片加载错误处理 ==========

  /**
   * 图片加载错误处理
   * 
   * 功能：当图片无法加载时触发
   * 
   * 当前行为：
   * - 记录错误日志（截断 URL 到 100 字符，避免日志过长）
   * - 不修改图片显示（保留浏览器的默认破损图标）
   * 
   * 可选增强：
   * - 设置占位图：img.src = '/path/to/error-image.png'
   * - 显示错误提示：添加 alt 文本或 tooltip
   * - 隐藏图片：添加 display: none 样式
   * 
   * @param event - 图片加载错误事件
   * 
   * @example
   * <img @error="handleImageLoadError" />
   */
  const handleImageLoadError = (event: Event) => {
    const img = event.target as HTMLImageElement
    console.error('❌ 图片加载失败:', img.src.substring(0, 100))
    // 可以设置一个默认的错误图片
    // img.src = '/path/to/error-image.png'
  }

  // ========== 返回 API ==========

  return {
    handleImageClick,
    handleDownloadImage,
    handleImageLoadError,
    generateImageFilename
  }
}
