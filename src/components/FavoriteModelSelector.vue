<template>
  <div class="favorite-model-selector">
    <!-- 收藏模型快速选择器 -->
    <div 
      v-if="favoriteModels.length > 0" 
      ref="favoritesListContainer" 
      class="favorites-list scrollbar-auto-hide"
      @scroll="handleFavoritesScroll"
    >
      <button
        v-for="model in favoriteModels"
        :key="model.id"
        @click="selectModel(model.id)"
        :class="[
          'favorite-model-btn',
          { 'active': isCurrentModel(model.id) }
        ]"
        :title="`切换到 ${model.name}\n上下文: ${formatContextLength(model.context_length)}\n价格 (USD / 1M tokens): $${formatUsdPer1MFromPerToken(model.pricing?.promptUsdPerToken)}/$${formatUsdPer1MFromPerToken(model.pricing?.completionUsdPerToken)}`"
      >
        <div class="model-info">
          <!-- 模型名称滚动容器 -->
          <div 
            class="model-name-container"
            :ref="el => setNameRef(model.id, el)"
            :class="{ 'scrolling': scrollingModels[model.id] }"
          >
            <!-- 
              环带式滚动结构
              ==================
              当文本需要滚动时，使用"环带"结构实现无缝循环：
              [文本A] + [空白区G] + [文本A副本]
              
              动画从位置 0 滚动到 -(C+G)，然后跳回 0
              由于文本重复，跳跃是视觉无缝的
              
              注意：只在 scrollingModels[model.id] 存在时显示（即判断需要滚动）
            -->
            <span 
              v-if="scrollingModels[model.id]"
              class="model-name-belt"
            >
              <!-- 第一份文本：总是显示 -->
              <span class="belt-text">{{ formatModelName(model.name) }}</span>
              
              <!-- 空白区：只在需要滚动时显示，宽度动态计算 -->
              <span 
                class="belt-gap"
                :style="{ width: `${scrollingModels[model.id].G}px` }"
              ></span>
              
              <!-- 第二份文本：只在需要滚动时显示，用于无缝循环 -->
              <span class="belt-text">{{ formatModelName(model.name) }}</span>
            </span>
            
            <!-- 
              静态文本显示
              ==================
              当文本不需要滚动时（文本宽度 <= 容器宽度），
              使用普通的 text-overflow: ellipsis 截断
              
              注意：ref 绑定用于测量文本宽度，即使在静态模式下也需要
            -->
            <span 
              v-if="!scrollingModels[model.id]" 
              class="model-name-static"
            >
              <!-- 添加隐藏的 .belt-text 用于宽度测量 -->
              <span class="belt-text" style="position: absolute; visibility: hidden; white-space: nowrap;">{{ formatModelName(model.name) }}</span>
              <!-- 实际显示的文本 -->
              {{ formatModelName(model.name) }}
            </span>
          </div>
          <span class="model-series">{{ model.series }}</span>
        </div>
        <div class="model-meta">
          <span class="context-badge" v-if="model.context_length">
            {{ formatContextLength(model.context_length) }}
          </span>
          <span class="modality-badge" v-if="hasMultimodal(model)">
            🎨
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { useModelStore } from '../stores/model'
import { formatUsdPer1MFromPerToken } from '@/utils/pricing'

const conversationStore = useConversationStore()
const modelStore = useModelStore()

const props = defineProps({
  conversationId: {
    type: String,
    default: null
  }
})

// 从 store 获取收藏模型列表
const favoriteModels = computed(() => modelStore.favoriteModels)

// 存储每个模型名称容器的 DOM 引用
// key: modelId, value: .model-name-container 元素
const nameRefs = ref({})

// 需要滚动的模型 ID 及动画参数
// key: modelId, value: { C, W, G, L, T, pDelay, pRead }
// C: 文本长度（px）
// W: 容器宽度（px）
// G: 间隔宽度（px）
// L: 环带总长（px）
// T: 动画周期（ms）
// pDelay/pRead: 关键帧位置（百分比）
const scrollingModels = ref({})

// 管理每个模型名称带的 Web Animations 句柄
const beltAnimations = new Map()

// 滚动容器引用和定时器
const favoritesListContainer = ref(null)
let favoritesScrollTimer = null
let animationHealthTimer = null

const isElementActuallyVisible = (el) => {
  if (!el) return false
  if (el.offsetParent === null) return false
  const style = window.getComputedStyle(el)
  if (!style) return false
  if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) {
    return false
  }
  if (el.getClientRects().length === 0) return false
  return true
}

// 滚动事件处理
const handleFavoritesScroll = () => {
  if (!favoritesListContainer.value) return
  favoritesListContainer.value.classList.add('scrolling')
  if (favoritesScrollTimer !== null) clearTimeout(favoritesScrollTimer)
  favoritesScrollTimer = setTimeout(() => {
    favoritesListContainer.value?.classList.remove('scrolling')
  }, 1000)
}

/**
 * 设置模型名称容器的 DOM 引用
 * 
 * 这是 Vue 的 ref 回调函数，在模板中通过 :ref="el => setNameRef(model.id, el)" 调用
 * 每当组件渲染或更新时，Vue 会为每个元素调用此函数
 * 
 * @param {string} modelId - 模型的唯一标识符
 * @param {HTMLElement|null} el - DOM 元素引用（卸载时为 null）
 */
const setNameRef = (modelId, el) => {
  if (el) {
    nameRefs.value[modelId] = el
  } else {
    delete nameRefs.value[modelId]
  }
}

/**
 * 停止指定模型的动画
 * @param {string} modelId
 */
const stopBeltAnimation = (modelId) => {
  const animation = beltAnimations.get(modelId)
  if (animation) {
    try {
      animation.cancel()
    } catch (err) {
      console.warn(`cancel animation for ${modelId} failed`, err)
    }
    beltAnimations.delete(modelId)
  }
}

/**
 * 停止所有已记录的动画
 */
const stopAllBeltAnimations = () => {
  for (const id of Array.from(beltAnimations.keys())) {
    stopBeltAnimation(id)
  }
}

/**
 * 为模型名称带启动 Web Animations
 * @param {string} modelId
 * @param {HTMLElement} beltEl
 * @param {{C:number, G:number, T:number, pDelay:number, pRead:number}} params
 */
let warnedNoAnimate = false

const startBeltAnimation = (modelId, beltEl, params) => {
  if (!beltEl || typeof beltEl.animate !== 'function') {
    if (!warnedNoAnimate) {
      console.warn('Web Animations API not available; model name marquee will not animate.')
      warnedNoAnimate = true
    }
    return
  }
  const { C, G, T, pDelay, pRead } = params

  // 先停止旧动画，避免叠加
  stopBeltAnimation(modelId)

  const animation = beltEl.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: pDelay / 100 },
      { transform: `translateX(${-C}px)`, offset: pRead / 100 },
      { transform: `translateX(${-(C + G)}px)`, offset: 1 }
    ],
    {
      duration: T,
      iterations: Infinity,
      easing: 'linear'
    }
  )

  beltAnimations.set(modelId, animation)
}

/**
 * DOM 更新后为需要滚动的模型应用动画
 * @param {Record<string, any>} modelsConfig
 */
const applyBeltAnimations = async (modelsConfig) => {
  await nextTick()
  for (const [modelId, config] of Object.entries(modelsConfig)) {
    const container = nameRefs.value[modelId]
    if (!container || container.offsetParent === null) continue
    const beltEl = container.querySelector('.model-name-belt')
    if (!beltEl) continue
    startBeltAnimation(modelId, beltEl, config)
  }
}

/**
 * Compute which model names need marquee and start WA animations.
 * Steps:
 * 1) Only measure when component is visible (offsetParent check)
 * 2) Measure container width W and text width C
 * 3) If C > W + 5 compute G/L/T/pDelay/pRead
 * 4) Update scrollingModels, restart animations, cancel stale ones
 */

const detectOverflow = async () => {
  await nextTick()

  const hasVisibleContainer = Object.values(nameRefs.value).some(
    el => isElementActuallyVisible(el)
  )
  if (!hasVisibleContainer) return

  const newScrollingModels = {}

  for (const [modelId, el] of Object.entries(nameRefs.value)) {
    if (!el || !isElementActuallyVisible(el)) continue

    try {
      const container = el.closest('.model-name-container')
      if (!container) continue

      const W = container.offsetWidth
      if (W < 30) continue

      const textSpan = el.querySelector('.belt-text')
      if (!textSpan) continue

      const C = textSpan.offsetWidth
      if (C <= 0 || C > 2000) continue

      if (C > W + 5) {
        const G = Math.max(40, 0.5 * C)
        const L = C + G

        const v1 = 50
        const tau0 = 500
        const t_read = (C / v1) * 1000
        const tau_gap = 0.25 * t_read
        const T = tau0 + t_read + tau_gap

        const pDelay = (tau0 / T) * 100
        const pRead = ((tau0 + t_read) / T) * 100

        newScrollingModels[modelId] = {
          C,
          W,
          G,
          L,
          T,
          pDelay,
          pRead
        }
      } else {
        stopBeltAnimation(modelId)
      }
    } catch (error) {
      console.warn(`Failed to measure model ${modelId}:`, error)
    }
  }

  for (const id of Array.from(beltAnimations.keys())) {
    if (!newScrollingModels[id]) {
      stopBeltAnimation(id)
    }
  }

  scrollingModels.value = newScrollingModels

  await applyBeltAnimations(newScrollingModels)
}

/**
 * 定期检查动画状态，发现缺失/暂停时尝试重启
 */
const restartBrokenAnimations = () => {
  for (const [modelId, config] of Object.entries(scrollingModels.value)) {
    const container = nameRefs.value[modelId]
    if (!container || !isElementActuallyVisible(container)) continue
    const beltEl = container.querySelector('.model-name-belt')
    if (!beltEl) continue
    const anim = beltAnimations.get(modelId)
    const running = anim && anim.playState === 'running'
    if (!running) {
      startBeltAnimation(modelId, beltEl, config)
    }
  }
}


const resolvedConversation = computed(() => {
  if (props.conversationId) {
    return conversationStore.conversationMap.get(props.conversationId) || null
  }
  return conversationStore.activeConversation
})

const currentModelId = computed(() => {
  return resolvedConversation.value?.model || modelStore.selectedModelId
})

/**
 * 检查指定模型是否为当前使用的模型
 * 
 * 用于在 UI 中高亮显示当前正在使用的模型
 * 
 * @param {string} modelId - 要检查的模型 ID
 * @returns {boolean} 如果是当前模型返回 true，否则返回 false
 */
const isCurrentModel = (modelId) => {
  return modelId === currentModelId.value
}

/**
 * 格式化模型名称，移除提供商前缀
 * 
 * 许多模型 ID 包含提供商前缀，例如：
 *   - "google/gemini-1.5-pro" -> "gemini-1.5-pro"
 *   - "anthropic/claude-3-opus" -> "claude-3-opus"
 *   - "openai/gpt-4" -> "gpt-4"
 * 
 * 移除冒号或斜杠之前的部分，让显示更简洁
 * 
 * @param {string} name - 原始模型名称
 * @returns {string} 格式化后的模型名称
 */
const formatModelName = (name) => {
  // 移除英文冒号(:)或中文冒号(：)及之前的所有文字
  // 这样可以移除提供商前缀，让显示更简洁
  // 
  // 示例：
  //   "OpenAI: GPT-4" -> "GPT-4"
  //   "Amazon: Nova Lite" -> "Nova Lite"
  //   "Google：Gemini Pro" -> "Gemini Pro"
  //   "Deepseek Chat" -> "Deepseek Chat" (无冒号，保持不变)
  // 
  // 正则表达式解释：
  //   ^         : 从字符串开头匹配
  //   [^:：]+   : 匹配一个或多个非冒号字符（英文或中文冒号）
  //   [:：]     : 匹配一个冒号（英文或中文）
  //   \s*       : 匹配零个或多个空白字符
  return name.replace(/^[^:：]+[:：]\s*/, '')
}

/**
 * 格式化上下文长度为易读格式
 * 
 * 将大数字转换为 K（千）或 M（百万）单位
 * 
 * @param {number} length - 上下文长度（token 数量）
 * @returns {string} 格式化后的字符串
 * 
 * @example
 * formatContextLength(128000)  // "128K"
 * formatContextLength(2000000) // "2M"
 * formatContextLength(800)     // "800"
 */
const formatContextLength = (length) => {
  if (!length) return ''
  
  // 百万级别：>= 1,000,000
  if (length >= 1000000) {
    return `${Math.floor(length / 1000000)}M`
  }
  
  // 千级别：>= 1,000
  if (length >= 1000) {
    return `${Math.floor(length / 1000)}K`
  }
  
  // 小于 1000，直接显示数字
  return length.toString()
}

/**
 * 检查模型是否支持多模态输入
 * 
 * 多模态模型可以接受多种类型的输入，如：
 *   - 文本 + 图片
 *   - 文本 + 音频
 *   - 文本 + 视频
 * 
 * @param {Object} model - 模型对象
 * @param {Array} model.input_modalities - 输入模态列表
 * @returns {boolean} 如果支持多模态返回 true，否则返回 false
 */
const hasMultimodal = (model) => {
  return model.input_modalities && model.input_modalities.length > 1
}

/**
 * 选择模型
 * 
 * 如果有活动会话，更新该会话的模型
 * 如果没有活动会话，设置全局默认模型
 * 
 * @param {string} modelId - 要选择的模型 ID
 */
const selectModel = (modelId) => {
  const targetConversationId = props.conversationId || conversationStore.activeConversation?.id
  if (targetConversationId) {
    conversationStore.updateConversationModel(targetConversationId, modelId)
    return
  }
  modelStore.selectedModelId = modelId
}

/**
 * 组件挂载后的初始化逻辑
 * 
 * =====================
 * 为什么需要延迟检测
 * =====================
 * 
 * 问题：
 *   在组件刚挂载时，DOM 元素可能还没有完成渲染和布局
 *   此时测量的 offsetWidth 可能是 0 或不准确的值
 * 
 * 解决方案：
 *   采用多次延迟检测策略，在不同时间点进行测量
 *   确保在各种设备和渲染速度下都能获得正确的尺寸
 * 
 * =====================
 * 检测时机设计
 * =====================
 * 
 * 300ms：快速首检
 *   - 在大多数现代设备上，此时布局已基本完成
 *   - 让用户能够快速看到滚动效果
 *   - 适用于常规渲染速度
 * 
 * 1000ms：延迟复检
 *   - 确保在慢速设备、复杂布局、或资源加载延迟的情况下也能正确工作
 *   - 如果测量结果与首检不同，会更新动画
 *   - 提供兜底保障
 * 
 * resize 事件：响应窗口变化
 *   - 用户调整窗口大小时，容器宽度会改变
 *   - 需要重新判断哪些文本需要滚动
 *   - 重新生成动画参数
 */
onMounted(() => {
  // 首次检测（300ms）
  setTimeout(() => {
    detectOverflow()
  }, 300)
  
  // 延迟检测（1000ms）
  setTimeout(() => {
    detectOverflow()
  }, 1000)
  
  // 绑定窗口大小变化事件
  const handleResize = () => {
    detectOverflow()
  }
  window.addEventListener('resize', handleResize)
  
  // 健康检查定时器，防止动画偶发停止
  animationHealthTimer = setInterval(() => {
    restartBrokenAnimations()
  }, 5000)
  
  // 组件卸载时清理事件监听器，防止内存泄漏
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    if (favoritesScrollTimer !== null) {
      clearTimeout(favoritesScrollTimer)
    }
    if (animationHealthTimer !== null) {
      clearInterval(animationHealthTimer)
      animationHealthTimer = null
    }
  })
})

/**
 * Cleanup on unmount: remove resize listener/timers and stop belt animations.
 */


onUnmounted(() => {
  stopAllBeltAnimations()
})

/**
 * 监听收藏模型列表的变化
 * 
 * =====================
 * 触发场景
 * =====================
 * 
 * 1. 用户添加收藏模型
 * 2. 用户移除收藏模型
 * 3. 收藏模型的顺序发生变化
 * 4. 收藏模型的属性被修改（因为使用了 deep: true）
 * 
 * =====================
 * 响应逻辑
 * =====================
 * 
 * 问题：
 *   列表变化时，Vue 会重新渲染元素
 *   旧的 DOM 引用（nameRefs）会失效
 *   如果不清理，可能会使用已销毁的 DOM 元素
 * 
 * 解决：
 *   1. 清空 nameRefs 和 scrollingModels
 *   2. 等待 300ms 让 Vue 完成重新渲染和 ref 注册
 *   3. 重新检测溢出和生成动画
 * 
 * =====================
 * 为什么需要延迟
 * =====================
 * 
 * Vue 的 watch 回调是同步触发的，此时：
 *   - 旧的 DOM 元素可能还没有完全卸载
 *   - 新的 DOM 元素可能还没有完全渲染
 *   - ref 回调可能还没有被调用
 * 
 * 300ms 延迟确保：
 *   - Vue 完成虚拟 DOM 对比和更新
 *   - 浏览器完成布局和渲染
 *   - ref 回调已经填充了新的 DOM 引用
 */
watch(favoriteModels, () => {
  // 清空滚动状态以重置为静态状态进行测量
  // 注意：不要清空 nameRefs，因为 DOM 元素可能被复用，且 setNameRef 会自动处理更新
  stopAllBeltAnimations()
  scrollingModels.value = {}
  
  // 延迟 300ms 让 DOM 完全更新并重新注册 refs 后再测量
  setTimeout(() => {
    detectOverflow()
  }, 300)
}, { deep: false })

/**
 * 监听会话数量的变化（增删会话会影响布局）
 * 
 * =====================
 * 触发场景
 * =====================
 * 
 * 1. 创建新会话
 * 2. 删除会话
 * 3. 会话的属性被修改（因为使用了 deep: true）
 * 
 * =====================
 * 为什么需要监听
 * =====================
 * 
 * 当会话列表变化时，左侧会话列表的宽度可能会改变
 * 这会间接影响右侧内容区域的宽度
 * 从而影响 FavoriteModelSelector 的可用宽度
 * 需要重新计算哪些模型名称需要滚动
 * 
 * 特别是删除会话时，已发现过滚动失效的 bug
 * 通过重新检测可以修复这个问题
 */
watch(() => conversationStore.conversations.length, () => {
  setTimeout(() => {
    detectOverflow()
  }, 300)
})

</script>

<style scoped>
/* 
 * ==================== 顶层容器样式 ====================
 */

.favorite-model-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;         /* 允许在外层 flex 容器里收缩，从而启用内部滚动 */
  width: 100%;
}

/* 
 * ==================== 收藏列表容器 ====================
 * 
 * 横向滚动容器，容纳所有收藏模型按钮
 */
.favorites-list {
  display: flex;
  align-items: center;
  gap: 0.5rem;          /* 按钮之间的间距 */
  flex: 1;              /* 占据父容器的剩余空间 */
  overflow-x: auto;     /* 当内容超出时允许水平滚动 */
  overflow-y: hidden;   /* 禁止垂直滚动 */
  max-width: 100%;      /* 确保不超出父容器 */
  min-width: 0;         /* 关键：允许自身宽度小于内容宽度，才能触发 overflow 滚动 */
  
  /* 平滑滚动效果 */
  scroll-behavior: smooth;                /* 现代浏览器支持的平滑滚动 */
  -webkit-overflow-scrolling: touch;      /* iOS Safari 的触摸滚动优化 */
}

/* 
 * ==================== 收藏模型按钮 ====================
 * 
 * 每个收藏模型的按钮容器
 * 布局：.model-info（左侧，flex: 1）+ .model-meta（右侧，固定宽度）
 */
.favorite-model-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;                       /* 最小宽度，避免按钮过小 */
  max-width: 180px;                       /* 最大宽度，保持按钮紧凑 */
  flex-shrink: 0;                         /* 不允许收缩，保持固定尺寸 */
}

/* 悬停效果 */
.favorite-model-btn:hover {
  border-color: #667eea;                  /* 边框变为紫色 */
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);  /* 阴影 */
  transform: translateY(-1px);            /* 轻微上浮 */
}

/* 当前选中的模型 */
.favorite-model-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);  /* 渐变背景 */
  color: white;
  border-color: transparent;
}

/* 
 * ==================== 模型信息容器 ====================
 * 
 * 包含模型名称和系列信息
 * 
 * 布局关键点：
 *   - flex: 1 让它占据按钮内除 .model-meta 外的所有剩余空间
 *   - min-width: 0 是 CSS Flexbox 的重要技巧
 *     没有它，flex 子元素会基于内容的最小宽度，无法真正收缩
 *     有了它，才能让文本正确溢出和滚动
 */
.model-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  flex: 1;                                /* 占据剩余空间 */
  min-width: 0;                           /* 允许收缩到小于内容宽度，关键！ */
  overflow: hidden;                       /* 隐藏溢出内容 */
}

/* 
 * ==================== 模型名称容器（滚动窗口）====================
 * 
 * 这是滚动动画的"观察窗口"
 * 环带在这个窗口内滚动，窗口外的部分被隐藏
 * 
 * 工作原理：
 *   - width: 100% 让窗口占满 .model-info 的宽度
 *   - overflow: hidden 隐藏窗口外的内容（关键！）
 *   - 环带通过 CSS transform: translateX() 在窗口内滚动
 */
.model-name-container {
  width: 100%;
  overflow: hidden;                       /* 关键：只显示窗口内的内容 */
  position: relative;
}

/* 
 * ==================== 静态模型名称 ====================
 * 
 * 当文本不需要滚动时（文本宽度 <= 容器宽度）显示
 * 使用传统的 CSS text-overflow 省略号截断
 */
.model-name-static {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;                    /* 强制单行显示 */
  overflow: hidden;                       /* 隐藏溢出部分 */
  text-overflow: ellipsis;                /* 用省略号表示被截断的文本 */
}

/* 
 * ==================== 环带元素 ====================
 * 
 * 当文本需要滚动时显示，包含完整的环带结构：
 * [文本A] + [空白G] + [文本A副本]
 * 
 * 技术要点：
 *   - display: inline-flex 让子元素（.belt-text 和 .belt-gap）水平排列
 *   - white-space: nowrap 防止文本换行
 *   - CSS 动画参数通过 Vue 的 :style 动态设置（见模板）
 * 
 * 动画参数（由 JavaScript 动态设置）：
 *   - animation-name: scroll-${modelId}（动态生成的 @keyframes）
 *   - animation-duration: ${T}ms（基于文本长度计算）
 *   - animation-timing-function: linear
 *   - animation-iteration-count: infinite
 */
.model-name-belt {
  display: inline-flex;                   /* 水平排列子元素 */
  white-space: nowrap;                    /* 防止文本换行 */
  font-size: 0.875rem;
  font-weight: 600;
  will-change: transform;                 /* 提示浏览器优化滚动动画 */
}

/* 
 * 滚动状态下的环带
 * 
 * 当 .model-name-container 有 .scrolling 类时：
 *   - width: max-content 让环带可以延伸到内容的完整宽度
 *   - 不受父容器宽度限制，允许完整的环带结构（C + G + C）显示
 *   - 如果没有这个设置，环带会被压缩到容器宽度
 */
.model-name-container.scrolling .model-name-belt {
  width: max-content;
}

/* 
 * ==================== 环带的文本部分 ====================
 * 
 * 环带中的实际文本，会出现两次（第一份和副本）
 * display: inline-block 让它们可以被正确测量宽度（offsetWidth）
 */
.belt-text {
  display: inline-block;
}

/* 
 * ==================== 环带的空白区 ====================
 * 
 * 用于分隔环带中的两份文本
 * 宽度通过 :style 动态设置为 ${G}px
 * 
 * 作用：
 *   - 让两份文本之间有足够的间距
 *   - 使循环跳跃点不那么突兀
 *   - 提供视觉缓冲，让滚动更自然
 *   - 快速滚过这个空白区（4倍速）可以节省时间
 */
.belt-gap {
  display: inline-block;
}

/* 
 * ==================== 模型系列标签 ====================
 * 
 * 显示模型所属系列，如 "GPT", "Claude", "Gemini" 等
 */
.model-series {
  font-size: 0.75rem;
  opacity: 0.7;                           /* 半透明，降低视觉权重 */
}

/* 当按钮被选中时，系列标签不那么透明 */
.favorite-model-btn.active .model-series {
  opacity: 0.9;
}

/* 
 * ==================== 模型元数据容器 ====================
 * 
 * 包含上下文长度徽章和多模态图标
 * 位于按钮右侧，固定宽度
 */
.model-meta {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
}

/* 
 * ==================== 上下文长度徽章 ====================
 * 
 * 显示模型支持的上下文窗口大小（如 "128K", "2M"）
 */
.context-badge {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  background: rgba(0, 0, 0, 0.1);         /* 半透明黑色背景 */
  border-radius: 0.25rem;
  font-weight: 600;
}

/* 当按钮被选中时，徽章背景变为半透明白色 */
.favorite-model-btn.active .context-badge {
  background: rgba(255, 255, 255, 0.2);
}

/* 
 * ==================== 多模态徽章 ====================
 * 
 * 显示 🎨 emoji，表示模型支持图片等多模态输入
 * 无需额外样式，使用 .modality-badge 类仅为语义化
 */.modality-badge {
  font-size: 0.875rem;
}
</style>
