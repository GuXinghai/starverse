import DOMPurify from 'dompurify'

/**
 * DOMPurify wrapper with security hardening.
 *
 * Security posture:
 * - OWASP-recommended SANITIZE_NAMED_PROPS to prevent DOM clobbering
 * - Explicit ALLOWED_TAGS whitelist (no script, iframe, object, embed, form)
 * - Explicit FORBID_ATTR for inline event handlers
 * - Tracks whether any content was removed for fallback-to-plaintext logic
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/DOM_Clobbering_Prevention_Cheat_Sheet.html
 */

const ALLOWED_TAGS = [
    // Block
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'pre', 'code', 'div', 'span',
    'blockquote', 'hr', 'br',
    // Lists
    'ul', 'ol', 'li',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    // Inline formatting
    'em', 'strong', 'a', 'del', 'ins', 'sup', 'sub', 'mark',
    // Media
    'img',
    // KaTeX specific
    'svg', 'path', 'line', 'rect', 'circle',
    'annotation', 'semantics', 'math', 'mrow', 'mi', 'mo', 'mn',
    'msup', 'msub', 'mfrac', 'mover', 'munder', 'msqrt', 'mtext',
    'mtable', 'mtr', 'mtd', 'mspace', 'mpadded', 'menclose',
]

const ALLOWED_ATTR = [
    'class', 'href', 'src', 'alt', 'title', 'id', 'rel', 'target',
    'style',        // needed for KaTeX inline styles
    'data-lang',    // code block language hint
    'data-theme',   // shiki theme hint
    // Table attrs
    'colspan', 'rowspan', 'align',
    // SVG attrs (KaTeX)
    'd', 'viewBox', 'width', 'height', 'fill', 'stroke',
    'stroke-width', 'xmlns', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'preserveAspectRatio', 'transform',
    // MathML attrs
    'mathvariant', 'stretchy', 'fence', 'separator', 'lspace', 'rspace',
    'displaystyle', 'scriptlevel', 'minsize', 'maxsize',
    'linethickness', 'columnalign', 'rowalign', 'columnspacing',
]

const FORBID_ATTR = [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onsubmit', 'onreset', 'onchange',
    'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
]

const SANITIZE_CONFIG: DOMPurify.Config = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    ADD_ATTR: ['target'],  // allow target="_blank" on links
}

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function isAllowedLinkHref(href: string): boolean {
    const value = href.trim()
    if (!value) return false
    if (value.startsWith('#') || value.startsWith('/')) return true
    if (value.startsWith('./') || value.startsWith('../')) return true

    const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    if (!hasExplicitScheme) return true

    try {
        const parsed = new URL(value)
        return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)
    } catch {
        return false
    }
}

export interface SanitizeResult {
    html: string
    removed: boolean
}

/**
 * Sanitize HTML string, returning the clean HTML and whether any dangerous
 * content was removed.
 *
 * When `removed` is true, callers should consider falling back to plain text
 * and logging a security warning.
 */
export function sanitizeHtml(dirty: string): SanitizeResult {
    let removed = false

    // Use hook to detect removals
    DOMPurify.addHook('uponSanitizeElement', (_node, data) => {
        if (data.tagName && SANITIZE_CONFIG.FORBID_TAGS &&
            (SANITIZE_CONFIG.FORBID_TAGS as string[]).includes(data.tagName)) {
            removed = true
        }
    })

    DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
        if (data.attrName && FORBID_ATTR.includes(data.attrName)) {
            removed = true
        }
        if (data.attrName === 'href' && typeof data.attrValue === 'string' && !isAllowedLinkHref(data.attrValue)) {
            data.keepAttr = false
            removed = true
        }
    })

    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        const el = node as Element
        if (!el || typeof (el as any).getAttribute !== 'function') return
        if (String((el as any).tagName ?? '').toLowerCase() !== 'a') return

        const href = el.getAttribute('href')
        if (href) {
            if (!isAllowedLinkHref(href)) {
                el.removeAttribute('href')
                removed = true
            } else {
                el.setAttribute('rel', 'noopener noreferrer')
            }
        }
    })

    const html = DOMPurify.sanitize(dirty, SANITIZE_CONFIG)

    DOMPurify.removeAllHooks()

    return { html, removed }
}
