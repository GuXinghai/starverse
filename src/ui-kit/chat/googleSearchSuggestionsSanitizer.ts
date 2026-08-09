import DOMPurify from 'dompurify'
import type { Config as DOMPurifyConfig } from 'dompurify'

const FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button']
const CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: ['div', 'p', 'span', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  FORBID_TAGS,
  FORBID_ATTR: ['style', 'src', 'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'],
}

export type GoogleSearchSuggestionsSanitizeResult = Readonly<{
  html: string
  removed: boolean
  plainText: string
}>

function isSafeHref(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function sanitizeGoogleSearchSuggestions(value: string): GoogleSearchSuggestionsSanitizeResult {
  let removed = false
  DOMPurify.addHook('uponSanitizeElement', (_node, data) => {
    if (data.tagName && FORBID_TAGS.includes(data.tagName)) removed = true
  })
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'href' && typeof data.attrValue === 'string' && !isSafeHref(data.attrValue)) {
      data.keepAttr = false
      removed = true
    }
    if (data.attrName?.toLowerCase().startsWith('on')) removed = true
  })
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const element = node as Element
    if (String(element.tagName ?? '').toLowerCase() !== 'a') return
    const href = element.getAttribute('href')
    if (!href || !isSafeHref(href)) {
      if (href) removed = true
      element.removeAttribute('href')
      return
    }
    element.setAttribute('target', '_blank')
    element.setAttribute('rel', 'noopener noreferrer')
  })
  try {
    const html = DOMPurify.sanitize(value, CONFIG) as string
    const plainText = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as string
    return { html, removed, plainText }
  } finally {
    DOMPurify.removeAllHooks()
  }
}
