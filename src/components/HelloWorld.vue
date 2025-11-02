<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ msg: string }>()

const count = ref(0)
</script>

<template>
  <div class="text-center max-w-2xl">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">{{ msg }}</h1>

    <div class="bg-white rounded-lg shadow-lg p-8 mb-8">
      <button 
        type="button" 
        @click="count++" 
        class="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
      >
        计数器: {{ count }}
      </button>
      <p class="mt-4 text-gray-600">
        编辑 
        <code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-purple-600">components/HelloWorld.vue</code> 
        来测试热更新
      </p>
    </div>

    <div class="space-y-4 text-gray-600">
      <p>
        查看 
        <a 
          href="https://vuejs.org/guide/quick-start.html#local" 
          target="_blank"
          class="text-blue-500 hover:text-blue-600 underline"
        >
          create-vue
        </a>
        ，官方的 Vue + Vite 模板
      </p>
      <p>
        在你的 IDE 中安装 
        <a 
          href="https://github.com/vuejs/language-tools" 
          target="_blank"
          class="text-blue-500 hover:text-blue-600 underline"
        >
          Volar
        </a>
        以获得更好的开发体验
      </p>
      <p class="text-gray-500 text-sm">点击 Electron-Vite 和 Vue 图标了解更多</p>
    </div>
  </div>
</template>
