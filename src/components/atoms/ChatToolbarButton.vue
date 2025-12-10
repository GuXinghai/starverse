<!-- 
ChatToolbarButton.vue - 聊天工具栏专用按钮组件

设计理念：
- 统一尺寸：使用 inline-flex + CSS 变量控制高度，与内容无关
- 灵活布局：支持「图标」「文本」「图标+文本」「文本+箭头」等任意组合
- 类型安全：强类型 size/variant props，避免样式不一致
- 零内容依赖：高度由 --toolbar-button-height token 控制，不受内部 DOM 影响

核心原则：
1. 使用 inline-flex + align-items: center 保证垂直居中
2. line-height: 1 避免文字撑开高度
3. box-sizing: border-box 确保 border 不额外增加高度
4. 禁止在业务代码中直接写原生 <button>，必须使用此组件
-->

<template>
  <button
    :type="type"
    class="chat-toolbar-button"
    :class="[
      `chat-toolbar-button--${size}`,
      `chat-toolbar-button--${variant}`,
      {
        'chat-toolbar-button--active': active,
        'chat-toolbar-button--icon-only': iconOnly
      }
    ]"
    :disabled="disabled"
    :aria-disabled="disabled"
    :aria-pressed="active"
    @click="handleClick"
  >
    <!-- 左侧图标槽 -->
    <span v-if="$slots.icon" class="chat-toolbar-button__icon">
      <slot name="icon" />
    </span>

    <!-- 文本内容 -->
    <span v-if="!iconOnly" class="chat-toolbar-button__label">
      <slot />
    </span>

    <!-- 右侧尾部槽（如下拉箭头） -->
    <span v-if="$slots.trailing" class="chat-toolbar-button__trailing">
      <slot name="trailing" />
    </span>

    <!-- 纯图标模式下的无障碍文本 -->
    <span v-if="iconOnly && $slots.default" class="sr-only">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * ChatToolbarButton Props
 */
interface Props {
  /** 按钮尺寸（控制高度和字体大小） */
  size?: 'sm' | 'md' | 'lg'
  
  /** 按钮视觉样式变体 */
  variant?: 'default' | 'primary' | 'ghost' | 'outline'
  
  /** HTML button type 属性 */
  type?: 'button' | 'submit' | 'reset'
  
  /** 禁用状态 */
  disabled?: boolean
  
  /** 激活状态（如「推理已启用」时的高亮） */
  active?: boolean
  
  /** 仅显示图标模式（文本作为无障碍标签） */
  iconOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  variant: 'default',
  type: 'button',
  disabled: false,
  active: false,
  iconOnly: false
})

/**
 * ChatToolbarButton Emits
 */
interface Emits {
  (e: 'click', event: MouseEvent): void
}

const emit = defineEmits<Emits>()

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
/* ========================================
 * 基础样式 - 核心布局
 * ======================================== */
.chat-toolbar-button {
  /* 关键：使用 inline-flex 布局，保证高度由 CSS 变量控制 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  
  /* 盒模型 */
  box-sizing: border-box;
  
  /* 字体相关 - line-height: 1 防止文字撑开高度 */
  font-size: var(--toolbar-button-font-size, 14px);
  line-height: 1;
  font-weight: 500;
  white-space: nowrap;
  
  /* 尺寸控制 - 高度由 CSS 变量统一管理 */
  height: var(--toolbar-button-height, 32px);
  padding-inline: var(--toolbar-button-padding-x, 12px);
  
  /* 视觉样式 */
  border-radius: 999px; /* 胶囊形状 */
  border: none;
  background: rgba(249, 250, 251, 0.9);
  color: rgba(0, 0, 0, 0.85);
  
  /* 交互反馈 */
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

/* Hover 状态 */
.chat-toolbar-button:hover:not(:disabled) {
  background: rgb(249, 250, 251);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* Active 状态（鼠标按下） */
.chat-toolbar-button:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: none;
}

/* Disabled 状态 */
.chat-toolbar-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Focus 可访问性 */
.chat-toolbar-button:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

/* ========================================
 * 尺寸变体 - 使用全局设计令牌
 * ======================================== */
.chat-toolbar-button--sm {
  --toolbar-button-height: var(--button-height-sm);
  --toolbar-button-font-size: 13px;
  --toolbar-button-padding-x: 10px;
  gap: 3px;
}

.chat-toolbar-button--md {
  --toolbar-button-height: var(--button-height-md);
  --toolbar-button-font-size: 14px;
  --toolbar-button-padding-x: 12px;
  gap: 4px;
}

.chat-toolbar-button--lg {
  --toolbar-button-height: var(--button-height-lg);
  --toolbar-button-font-size: 15px;
  --toolbar-button-padding-x: 14px;
  gap: 5px;
}

/* ========================================
 * 视觉变体 - 只改颜色，不改尺寸
 * ======================================== */
.chat-toolbar-button--primary {
  background: #3b82f6;
  color: white;
}

.chat-toolbar-button--primary:hover:not(:disabled) {
  background: #2563eb;
}

.chat-toolbar-button--ghost {
  background: transparent;
}

.chat-toolbar-button--ghost:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.04);
}

.chat-toolbar-button--outline {
  background: transparent;
}

.chat-toolbar-button--outline:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.02);
}

/* ========================================
 * 激活状态（功能已启用）
 * ======================================== */
.chat-toolbar-button--active {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

.chat-toolbar-button--active:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.15);
}

/* ========================================
 * 纯图标模式（正方形按钮）
 * ======================================== */
.chat-toolbar-button--icon-only {
  padding-inline: 0;
  aspect-ratio: 1 / 1;
  width: var(--toolbar-button-height, 32px);
}

/* ========================================
 * 内部元素布局
 * ======================================== */
.chat-toolbar-button__icon,
.chat-toolbar-button__trailing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.chat-toolbar-button__label {
  display: inline-block;
  line-height: 1;
}

/* 无障碍文本隐藏 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* ========================================
 * 暗色模式适配
 * ======================================== */
@media (prefers-color-scheme: dark) {
  .chat-toolbar-button {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .chat-toolbar-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .chat-toolbar-button--ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }

  .chat-toolbar-button--active {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.4);
    color: #60a5fa;
  }
}
</style>
