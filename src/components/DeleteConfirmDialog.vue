<template>
  <!-- 遮罩层 -->
  <Transition name="fade">
    <div 
      v-if="show"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="$emit('close')"
    >
      <!-- 对话框 -->
      <Transition name="scale">
        <div 
          v-if="show"
          class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          <!-- 标题栏 -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900">删除确认</h3>
            <button
              @click="$emit('close')"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              title="取消"
              type="button"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <!-- 内容区 -->
          <div class="px-6 py-5">
            <p class="text-gray-700 mb-6">
              请选择删除方式：
            </p>
            
            <!-- 按钮组 -->
            <div class="flex gap-3">
              <!-- 左侧：删除所有分支（默认样式） -->
              <button
                @click="handleDeleteAllVersions"
                class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors font-medium"
                type="button"
              >
                删除所有分支
              </button>
              
              <!-- 右侧：删除当前分支（蓝色高亮） -->
              <button
                @click="handleDeleteCurrentVersion"
                class="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors font-medium shadow-sm"
                type="button"
              >
                删除当前分支
              </button>
            </div>
            
            <!-- 说明文字 -->
            <div class="mt-5 text-xs text-gray-500 space-y-1.5 bg-gray-50 rounded-lg p-3">
              <p class="flex items-start gap-2">
                <span class="text-blue-500 font-bold mt-0.5">•</span>
                <span><strong class="text-gray-700">删除当前分支</strong>：仅删除当前显示的版本</span>
              </p>
              <p class="flex items-start gap-2">
                <span class="text-gray-400 font-bold mt-0.5">•</span>
                <span><strong class="text-gray-700">删除所有分支</strong>：删除该消息的所有版本及后续对话</span>
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
/**
 * 删除确认对话框
 * 提供两种删除选项：删除当前分支 或 删除所有分支
 */

const props = defineProps({
  /**
   * 是否显示对话框
   */
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'close',              // 关闭对话框
  'delete-current-version',  // 删除当前分支
  'delete-all-versions'      // 删除所有分支
])

/**
 * 处理删除当前版本
 */
function handleDeleteCurrentVersion() {
  emit('delete-current-version')
  emit('close')
}

/**
 * 处理删除所有版本
 */
function handleDeleteAllVersions() {
  emit('delete-all-versions')
  emit('close')
}
</script>

<style scoped>
/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 缩放动画 */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.2s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
