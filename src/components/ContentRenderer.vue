<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { Tokens } from 'marked'
import katex from 'katex'
import hljs from 'highlight.js'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css' // 使用 GitHub 浅色主题

// Props 定义
const props = defineProps<{
  content: string
}>()

// 配置 marked 的渲染器来支持代码高亮
const renderer = new marked.Renderer()

renderer.code = function({ text, lang }: Tokens.Code): string {
  const code = text
  const language = lang?.toLowerCase()
  
  // 如果没有指定语言，或语言是 text/markdown/md，则作为 Markdown 渲染
  if (!language || language === 'text' || language === 'markdown' || language === 'md') {
    // 递归渲染 Markdown（注意：这里不使用自定义 renderer，避免无限递归）
    try {
      const renderedMd = marked(code, { breaks: true, gfm: true }) as string
      return `<div class="nested-markdown">${renderedMd}</div>`
    } catch (err) {
      console.error('嵌套 Markdown 渲染错误:', err)
      // 如果渲染失败，返回纯文本
      return `<div class="text-block">${code}</div>`
    }
  }
  
  // 如果指定了语言且 highlight.js 支持该语言
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    } catch (err) {
      console.error('代码高亮错误:', err)
    }
  }
  
  // 尝试自动检测语言
  try {
    const result = hljs.highlightAuto(code)
    const detectedLang = result.language || 'plaintext'
    return `<pre><code class="hljs language-${detectedLang}">${result.value}</code></pre>`
  } catch (err) {
    console.error('代码自动高亮错误:', err)
    // 如果高亮失败，返回纯文本代码
    return `<pre><code>${code}</code></pre>`
  }
}

// 渲染 HTML 的计算属性
const renderedHtml = computed(() => {
  // 空值检查：如果 content 为空、undefined 或 null，返回空字符串
  if (!props.content) {
    return ''
  }
  
  let text = props.content
  
  // 用于存储提取的公式
  const mathMap = new Map<string, string>()
  let mathIndex = 0
  
  // 第一步：提取并渲染块级公式 $$...$$（必须在 marked 之前）
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      const placeholder = `MATHBLOCK${mathIndex}`
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false
      })
      mathMap.set(placeholder, rendered)
      mathIndex++
      return placeholder
    } catch (error) {
      console.error('KaTeX 渲染错误 (块级):', error)
      return match
    }
  })
  
  // 第二步：提取并渲染行内公式 $...$（必须在 marked 之前）
  text = text.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    try {
      const placeholder = `MATHINLINE${mathIndex}`
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false
      })
      mathMap.set(placeholder, rendered)
      mathIndex++
      return placeholder
    } catch (error) {
      console.error('KaTeX 渲染错误 (行内):', error)
      return match
    }
  })
  
  // 第三步：使用 marked 将 Markdown 转换为 HTML
  let html = marked(text, { 
    renderer,
    breaks: true,  // 支持 GFM 换行
    gfm: true      // 启用 GitHub Flavored Markdown
  }) as string
  
  // 第四步：将公式占位符替换回渲染后的 HTML
  mathMap.forEach((rendered, placeholder) => {
    // 使用全局替换，确保所有出现的占位符都被替换
    html = html.split(placeholder).join(rendered)
  })

  return html
})
</script>

<template>
  <div v-html="renderedHtml" class="content-renderer"></div>
</template>

<style scoped>
.content-renderer {
  /* 继承父元素的文字颜色，不设置固定颜色 */
  color: inherit;
}

/* 移除第一个元素的上边距和最后一个元素的下边距，避免额外空白 */
.content-renderer :deep(*:first-child) {
  margin-top: 0;
}

.content-renderer :deep(*:last-child) {
  margin-bottom: 0;
}

/* Markdown 样式增强 */
.content-renderer :deep(h1) {
  font-size: 1.875rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  color: inherit;
}

.content-renderer :deep(h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
  color: inherit;
}

.content-renderer :deep(h3) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  color: inherit;
}

.content-renderer :deep(p) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  line-height: 1.625;
  color: inherit;
}

.content-renderer :deep(code) {
  background-color: #f3f4f6;
  color: #1f2937;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(code) {
    background-color: #374151;
    color: #e5e7eb;
  }
}

.content-renderer :deep(pre) {
  background-color: #f6f8fa;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin-top: 1rem;
  margin-bottom: 1rem;
  border: 1px solid #e1e4e8;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(pre) {
    background-color: #0d1117;
    border-color: #30363d;
  }
}

.content-renderer :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* highlight.js 样式增强 */
.content-renderer :deep(.hljs) {
  background-color: transparent;
  padding: 0;
  display: block;
  overflow-x: auto;
}

.content-renderer :deep(ul) {
  list-style-type: disc;
  list-style-position: inside;
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  color: inherit;
}

.content-renderer :deep(ol) {
  list-style-type: decimal;
  list-style-position: inside;
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  color: inherit;
}

.content-renderer :deep(li) {
  color: inherit;
}

.content-renderer :deep(blockquote) {
  border-left-width: 4px;
  border-left-color: #d1d5db;
  padding-left: 1rem;
  font-style: italic;
  margin-top: 1rem;
  margin-bottom: 1rem;
  color: inherit;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(blockquote) {
    border-left-color: #4b5563;
  }
}

.content-renderer :deep(a) {
  color: #2563eb;
  text-decoration: none;
}

.content-renderer :deep(a:hover) {
  text-decoration: underline;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(a) {
    color: #60a5fa;
  }
}

/* KaTeX 公式样式 */
.content-renderer :deep(.katex) {
  font-size: 1rem;
  color: inherit;
}

.content-renderer :deep(.katex-display) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  overflow-x: auto;
}

/* 嵌套 Markdown 样式（来自无语言或 text/markdown 代码块） */
.content-renderer :deep(.nested-markdown) {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  border-left: 4px solid #3b82f6;
  margin-top: 1rem;
  margin-bottom: 1rem;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(.nested-markdown) {
    background-color: #1f2937;
    border-left-color: #60a5fa;
  }
}

.content-renderer :deep(.nested-markdown) *:first-child {
  margin-top: 0;
}

.content-renderer :deep(.nested-markdown) *:last-child {
  margin-bottom: 0;
}

/* 纯文本块样式 */
.content-renderer :deep(.text-block) {
  white-space: pre-wrap;
  font-family: inherit;
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
}

@media (prefers-color-scheme: dark) {
  .content-renderer :deep(.text-block) {
    background-color: #1f2937;
  }
}
</style>
