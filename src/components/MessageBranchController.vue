<template>
  <div class="flex items-center gap-1 text-xs text-gray-600">
    <!-- 向前切换按钮 -->
    <button
      @click="$emit('switch', -1)"
      :disabled="currentIndex === 0"
      :class="[
        'w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150',
        currentIndex === 0 
          ? 'text-gray-300 cursor-not-allowed' 
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
      ]"
      :title="`上一个版本 (${currentIndex}/${totalVersions})`"
      type="button"
    >
      <span class="text-base font-bold select-none">&lt;</span>
    </button>
    
    <!-- 版本指示器 -->
    <span class="mx-0.5 font-mono text-gray-500 select-none min-w-[2.5rem] text-center">
      {{ currentIndex + 1 }}/{{ totalVersions }}
    </span>
    
    <!-- 向后切换按钮 -->
    <button
      @click="$emit('switch', 1)"
      :disabled="currentIndex === totalVersions - 1"
      :class="[
        'w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150',
        currentIndex === totalVersions - 1
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
      ]"
      :title="`下一个版本 (${currentIndex + 2}/${totalVersions})`"
      type="button"
    >
      <span class="text-base font-bold select-none">&gt;</span>
    </button>
  </div>
</template>

<script setup>
/**
 * 消息分支版本切换器
 * 显示 <1/3> 样式的版本指示器，支持左右切换
 */

defineProps({
  /**
   * 当前显示的版本索引 (0-based)
   */
  currentIndex: {
    type: Number,
    required: true,
    validator: (value) => value >= 0
  },
  
  /**
   * 总版本数
   */
  totalVersions: {
    type: Number,
    required: true,
    validator: (value) => value > 0
  }
})

/**
 * 事件：切换版本
 * @param {number} direction - 方向：-1向前，+1向后
 */
defineEmits(['switch'])
</script>
