/**
 * Rich Text Rendering Module — barrel export
 *
 * Public API for the dual-channel rendering engine.
 */

// Types
export type { StreamBlock, BlockKind, BlockState, RenderOp, FinalSnapshot } from './types'

// Core engines
export { BlockTokenizer } from './blockTokenizer'
export { StreamRenderer } from './streamRenderer'
export { renderFinal, renderBlockSync } from './finalRenderer'

// Security
export { sanitizeHtml } from './sanitizer'
export type { SanitizeResult } from './sanitizer'

// Shiki
export { getHighlighter, highlightSync, highlightAsync, disposeHighlighter } from './shikiLoader'

// Vue components  (import directly from .vue files for tree-shaking)
// import RichTextContent from '@/ui-kit/chat/richtext/RichTextContent.vue'
// import RichTextFinal from '@/ui-kit/chat/richtext/RichTextFinal.vue'
