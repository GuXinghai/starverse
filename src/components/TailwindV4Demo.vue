<!--
  Tailwind CSS v4 功能演示页面
  
  此文件演示了 Tailwind v4 的各种功能和配置方式
  可作为测试页面验证配置是否正确
-->

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-8">
    <div class="max-w-6xl mx-auto space-y-8">
      <!-- 标题部分 -->
      <header class="text-center space-y-4">
        <h1 class="text-4xl font-bold text-slate-900 dark:text-white">
          Tailwind CSS v4 功能演示
        </h1>
        <p class="text-lg text-slate-600 dark:text-slate-400">
          验证 Tailwind v4.1.16 的配置和功能
        </p>
      </header>

      <!-- 配置信息卡片 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          ✅ 当前配置
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div class="text-sm font-medium text-blue-900 dark:text-blue-300">
              Tailwind 版本
            </div>
            <div class="text-xl font-bold text-blue-600 dark:text-blue-400">
              v4.1.16
            </div>
          </div>
          <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div class="text-sm font-medium text-green-900 dark:text-green-300">
              PostCSS 插件
            </div>
            <div class="text-xl font-bold text-green-600 dark:text-green-400">
              @tailwindcss/postcss
            </div>
          </div>
          <div class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div class="text-sm font-medium text-purple-900 dark:text-purple-300">
              导入语法
            </div>
            <div class="text-xl font-bold text-purple-600 dark:text-purple-400">
              @import "tailwindcss"
            </div>
          </div>
          <div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <div class="text-sm font-medium text-amber-900 dark:text-amber-300">
              配置模式
            </div>
            <div class="text-xl font-bold text-amber-600 dark:text-amber-400">
              混合模式
            </div>
          </div>
        </div>
      </section>

      <!-- 自定义颜色演示 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          🎨 自定义颜色系统
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <!-- Primary 颜色 -->
          <div class="space-y-2">
            <div class="h-20 bg-primary-500 rounded-lg shadow"></div>
            <p class="text-xs text-center text-slate-600 dark:text-slate-400">
              primary-500
            </p>
          </div>
          <!-- Secondary 颜色 -->
          <div class="space-y-2">
            <div class="h-20 bg-secondary-500 rounded-lg shadow"></div>
            <p class="text-xs text-center text-slate-600 dark:text-slate-400">
              secondary-500
            </p>
          </div>
          <!-- Success 颜色 -->
          <div class="space-y-2">
            <div class="h-20 bg-success-500 rounded-lg shadow"></div>
            <p class="text-xs text-center text-slate-600 dark:text-slate-400">
              success-500
            </p>
          </div>
          <!-- Warning 颜色 -->
          <div class="space-y-2">
            <div class="h-20 bg-warning-500 rounded-lg shadow"></div>
            <p class="text-xs text-center text-slate-600 dark:text-slate-400">
              warning-500
            </p>
          </div>
          <!-- Danger 颜色 -->
          <div class="space-y-2">
            <div class="h-20 bg-danger-500 rounded-lg shadow"></div>
            <p class="text-xs text-center text-slate-600 dark:text-slate-400">
              danger-500
            </p>
          </div>
        </div>
      </section>

      <!-- 自定义间距演示 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          📏 自定义间距系统
        </h2>
        <div class="space-y-3">
          <div class="flex items-center gap-4">
            <div class="w-32 text-sm text-slate-600 dark:text-slate-400">
              spacing-18
            </div>
            <div class="h-8 bg-blue-500 rounded" :style="{ width: '4.5rem' }"></div>
            <span class="text-xs text-slate-500">4.5rem (72px)</span>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-32 text-sm text-slate-600 dark:text-slate-400">
              spacing-88
            </div>
            <div class="h-8 bg-blue-500 rounded" :style="{ width: '22rem' }"></div>
            <span class="text-xs text-slate-500">22rem (352px)</span>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-32 text-sm text-slate-600 dark:text-slate-400">
              spacing-100
            </div>
            <div class="h-8 bg-blue-500 rounded" :style="{ width: '25rem' }"></div>
            <span class="text-xs text-slate-500">25rem (400px)</span>
          </div>
        </div>
      </section>

      <!-- 动画演示 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          ✨ 自定义动画
        </h2>
        <div class="space-y-6">
          <!-- 跑马灯动画 -->
          <div>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">
              跑马灯动画 (animate-marquee)
            </p>
            <div class="overflow-hidden bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
              <div class="flex gap-8 animate-marquee">
                <span class="text-2xl font-bold text-blue-600">🚀 Tailwind CSS</span>
                <span class="text-2xl font-bold text-purple-600">✨ v4.1.16</span>
                <span class="text-2xl font-bold text-green-600">⚡ 快速</span>
                <span class="text-2xl font-bold text-amber-600">🎨 现代</span>
                <span class="text-2xl font-bold text-red-600">💪 强大</span>
                <!-- 重复一遍以实现无缝循环 -->
                <span class="text-2xl font-bold text-blue-600">🚀 Tailwind CSS</span>
                <span class="text-2xl font-bold text-purple-600">✨ v4.1.16</span>
                <span class="text-2xl font-bold text-green-600">⚡ 快速</span>
                <span class="text-2xl font-bold text-amber-600">🎨 现代</span>
                <span class="text-2xl font-bold text-red-600">💪 强大</span>
              </div>
            </div>
          </div>

          <!-- 慢速旋转 -->
          <div>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">
              慢速旋转 (animate-spin-slow)
            </p>
            <div class="flex gap-4">
              <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full animate-spin-slow"></div>
              <div class="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full animate-spin-slow" style="animation-delay: 1s"></div>
              <div class="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full animate-spin-slow" style="animation-delay: 2s"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- 响应式设计演示 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          📱 响应式设计
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg text-center">
            <div class="text-sm font-medium text-red-900 dark:text-red-300">
              基础 (< 640px)
            </div>
            <div class="text-xs text-red-600 dark:text-red-400 mt-1">
              默认显示
            </div>
          </div>
          <div class="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg text-center hidden sm:block">
            <div class="text-sm font-medium text-yellow-900 dark:text-yellow-300">
              sm (≥ 640px)
            </div>
            <div class="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              小屏幕显示
            </div>
          </div>
          <div class="p-4 bg-green-100 dark:bg-green-900/20 rounded-lg text-center hidden md:block">
            <div class="text-sm font-medium text-green-900 dark:text-green-300">
              md (≥ 768px)
            </div>
            <div class="text-xs text-green-600 dark:text-green-400 mt-1">
              中屏幕显示
            </div>
          </div>
          <div class="p-4 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-center hidden lg:block">
            <div class="text-sm font-medium text-blue-900 dark:text-blue-300">
              lg (≥ 1024px)
            </div>
            <div class="text-xs text-blue-600 dark:text-blue-400 mt-1">
              大屏幕显示
            </div>
          </div>
        </div>
      </section>

      <!-- 暗色模式演示 -->
      <section class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          🌓 暗色模式支持
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-6 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              浅色主题
            </h3>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              使用 dark: 前缀可以轻松创建暗色模式样式
            </p>
          </div>
          <div class="p-6 bg-slate-900 dark:bg-slate-600 rounded-lg">
            <h3 class="text-lg font-semibold text-white mb-2">
              深色主题
            </h3>
            <p class="text-sm text-slate-300">
              自动适应系统主题偏好或手动切换
            </p>
          </div>
        </div>
      </section>

      <!-- 新特性说明 -->
      <section class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
        <h2 class="text-2xl font-semibold mb-4">
          🚀 Tailwind v4 新特性
        </h2>
        <ul class="space-y-2 text-sm">
          <li class="flex items-start gap-2">
            <span class="text-green-300">✅</span>
            <span>使用 <code class="bg-white/20 px-2 py-0.5 rounded">@import "tailwindcss"</code> 替代旧的 @tailwind 指令</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-300">✅</span>
            <span>支持 <code class="bg-white/20 px-2 py-0.5 rounded">@theme</code> 指令在 CSS 中配置主题</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-300">✅</span>
            <span>CSS 配置支持媒体查询和 CSS 函数</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-300">✅</span>
            <span>向后兼容 tailwind.config.js 配置方式</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-300">✅</span>
            <span>热更新支持，CSS 修改无需重启</span>
          </li>
        </ul>
      </section>

      <!-- 文档链接 -->
      <footer class="text-center text-sm text-slate-600 dark:text-slate-400 space-y-2">
        <p>
          查看完整文档：
          <a href="#" class="text-blue-600 dark:text-blue-400 hover:underline">
            docs/TAILWIND_V4_MIGRATION.md
          </a>
        </p>
        <p class="text-xs">
          Starverse © 2025 - Tailwind CSS v4.1.16
        </p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
// 此演示页面无需额外逻辑
// 所有样式通过 Tailwind CSS 类实现
</script>

<style scoped>
/* 自定义跑马灯动画（如果 tailwind.config.js 中未定义） */
@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
