<template>
  <div class="relative inline-block group">
    <!-- 图片预览 -->
    <div class="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100">
      <img 
        :src="imageDataUri" 
        :alt="altText"
        class="w-full h-full object-cover"
        @error="handleImageError"
      />
      
      <!-- 加载状态 -->
      <div 
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50"
      >
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
      </div>
      
      <!-- 错误状态 -->
      <div 
        v-if="hasError"
        class="absolute inset-0 flex items-center justify-center bg-red-100"
      >
        <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </div>
    </div>
    
    <!-- 移除按钮 -->
    <button
      @click="$emit('remove')"
      class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center"
      title="移除图片"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
    
    <!-- 文件大小提示（悬停显示） -->
    <div 
      v-if="fileSizeKB"
      class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap"
    >
      {{ fileSizeKB }} KB
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// Props
const props = defineProps<{
  imageDataUri: string
  altText?: string
}>()

// Emits
defineEmits<{
  remove: []
}>()

// State
const isLoading = ref(true)
const hasError = ref(false)

// 计算文件大小（从 base64 估算）
const fileSizeKB = computed(() => {
  try {
    // base64 字符串格式: data:image/...;base64,XXXXX
    const base64Part = props.imageDataUri.split(',')[1]
    if (!base64Part) return null
    
    // base64 编码后的大小约为原始大小的 4/3
    const sizeInBytes = (base64Part.length * 3) / 4
    return (sizeInBytes / 1024).toFixed(1)
  } catch {
    return null
  }
})

// 图片加载完成
const handleImageLoad = () => {
  isLoading.value = false
  hasError.value = false
}

// 图片加载错误
const handleImageError = () => {
  isLoading.value = false
  hasError.value = true
  console.error('❌ 图片加载失败:', props.imageDataUri.substring(0, 50) + '...')
}

// 创建图片对象预加载
onMounted(() => {
  const img = new Image()
  img.onload = handleImageLoad
  img.onerror = handleImageError
  img.src = props.imageDataUri
})
</script>

<style scoped>
/* 确保图片平滑渲染 */
img {
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
</style>
