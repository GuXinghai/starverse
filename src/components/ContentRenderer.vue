<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { Tokens } from 'marked'
import katex from 'katex'
import hljs from 'highlight.js'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css' // 浣跨敤 GitHub 娴呰壊涓婚

import { electronApiBridge } from '../utils/electronBridge'

// Props 瀹氫箟
const props = defineProps<{
  content: string
}>()

// 閰嶇疆 marked 鐨勬覆鏌撳櫒鏉ユ敮鎸佷唬鐮侀珮浜?
const renderer = new marked.Renderer()

renderer.code = function({ text, lang }: Tokens.Code): string {
  const code = text
  const language = lang?.toLowerCase()
  
  // 濡傛灉娌℃湁鎸囧畾璇█锛屾垨璇█鏄?text/markdown/md锛屽垯浣滀负 Markdown 娓叉煋
  if (!language || language === 'text' || language === 'markdown' || language === 'md') {
    // 閫掑綊娓叉煋 Markdown锛堟敞鎰忥細杩欓噷涓嶄娇鐢ㄨ嚜瀹氫箟 renderer锛岄伩鍏嶆棤闄愰€掑綊锛?
    try {
      const renderedMd = marked(code, { breaks: true, gfm: true }) as string
      return `<div class="nested-markdown">${renderedMd}</div>`
    } catch (err) {
      console.error('宓屽 Markdown 娓叉煋閿欒:', err)
      // 濡傛灉娓叉煋澶辫触锛岃繑鍥炵函鏂囨湰
      return `<div class="text-block">${code}</div>`
    }
  }
  
  // 濡傛灉鎸囧畾浜嗚瑷€涓?highlight.js 鏀寔璇ヨ瑷€
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    } catch (err) {
      console.error('浠ｇ爜楂樹寒閿欒:', err)
    }
  }
  
  // 灏濊瘯鑷姩妫€娴嬭瑷€
  try {
    const result = hljs.highlightAuto(code)
    const detectedLang = result.language || 'plaintext'
    return `<pre><code class="hljs language-${detectedLang}">${result.value}</code></pre>`
  } catch (err) {
    console.error('浠ｇ爜鑷姩楂樹寒閿欒:', err)
    // 濡傛灉楂樹寒澶辫触锛岃繑鍥炵函鏂囨湰浠ｇ爜
    return `<pre><code>${code}</code></pre>`
  }
}

renderer.link = function(href: string | null, title: string | null, text: string): string {
  const safeHref = href ?? ''
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener"${titleAttr}>${text}</a>`
}

// 娓叉煋 HTML 鐨勮绠楀睘鎬?
const renderedHtml = computed(() => {
  // 绌哄€兼鏌ワ細濡傛灉 content 涓虹┖銆乽ndefined 鎴?null锛岃繑鍥炵┖瀛楃涓?
  if (!props.content) {
    return ''
  }
  
  let text = props.content
  
  // 鐢ㄤ簬瀛樺偍鎻愬彇鐨勫叕寮?
  const mathMap = new Map<string, string>()
  let mathIndex = 0
  
  // 绗竴姝ワ細鎻愬彇骞舵覆鏌撳潡绾у叕寮?$$...$$锛堝繀椤诲湪 marked 涔嬪墠锛?
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
      console.error('KaTeX 娓叉煋閿欒 (鍧楃骇):', error)
      return match
    }
  })
  
  // 绗簩姝ワ細鎻愬彇骞舵覆鏌撹鍐呭叕寮?$...$锛堝繀椤诲湪 marked 涔嬪墠锛?
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
      console.error('KaTeX 娓叉煋閿欒 (琛屽唴):', error)
      return match
    }
  })
  
  // 绗笁姝ワ細浣跨敤 marked 灏?Markdown 杞崲涓?HTML
  let html = marked(text, { 
    renderer,
    breaks: true,  // 鏀寔 GFM 鎹㈣
    gfm: true      // 鍚敤 GitHub Flavored Markdown
  }) as string
  
  // 绗洓姝ワ細灏嗗叕寮忓崰浣嶇鏇挎崲鍥炴覆鏌撳悗鐨?HTML
  mathMap.forEach((rendered, placeholder) => {
    // 浣跨敤鍏ㄥ眬鏇挎崲锛岀‘淇濇墍鏈夊嚭鐜扮殑鍗犱綅绗﹂兘琚浛鎹?
    html = html.split(placeholder).join(rendered)
  })

  return html
})

const handleLinkClick = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor?.href) {
    return
  }

  const href = anchor.href
  if (!href.startsWith('http://') && !href.startsWith('https://')) {
    return
  }

  event.preventDefault()
  if (electronApiBridge?.openExternal) {
    electronApiBridge.openExternal(href).catch(error => {
      console.error('[ContentRenderer] openExternal failed, fallback to window.open:', error)
      window.open(href, '_blank', 'noopener')
    })
  } else {
    window.open(href, '_blank', 'noopener')
  }
}
</script>

<template>
  <div v-html="renderedHtml" class="content-renderer" @click="handleLinkClick"></div>
</template>

<style scoped>
.content-renderer {
  /* 缁ф壙鐖跺厓绱犵殑鏂囧瓧棰滆壊锛屼笉璁剧疆鍥哄畾棰滆壊 */
  color: inherit;
}

/* 绉婚櫎绗竴涓厓绱犵殑涓婅竟璺濆拰鏈€鍚庝竴涓厓绱犵殑涓嬭竟璺濓紝閬垮厤棰濆绌虹櫧 */
.content-renderer :deep(*:first-child) {
  margin-top: 0;
}

.content-renderer :deep(*:last-child) {
  margin-bottom: 0;
}

/* Markdown 鏍峰紡澧炲己 */
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

/* highlight.js 鏍峰紡澧炲己 */
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

/* KaTeX 鍏紡鏍峰紡 */
.content-renderer :deep(.katex) {
  font-size: 1rem;
  color: inherit;
}

.content-renderer :deep(.katex-display) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  overflow-x: auto;
}

/* 宓屽 Markdown 鏍峰紡锛堟潵鑷棤璇█鎴?text/markdown 浠ｇ爜鍧楋級 */
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

/* 绾枃鏈潡鏍峰紡 */
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

