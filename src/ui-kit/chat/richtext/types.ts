/** Block-level token types recognized by the streaming tokenizer */
export type BlockKind =
    | 'paragraph'
    | 'fenced_code'
    | 'math_block'
    | 'heading'
    | 'blockquote'
    | 'list'
    | 'hr'
    | 'table'

/** Lifecycle state of a block during streaming */
export type BlockState = 'open' | 'closed'

/** A single recognized block in the stream */
export interface StreamBlock {
    kind: BlockKind
    content: string
    state: BlockState
    /** DOM node anchored to this block (used by imperative renderer) */
    domAnchor?: Node
    /** Extra metadata, e.g. language hint for fenced_code */
    meta?: string
}

/** Render operations emitted by the streaming engine */
export type RenderOp =
    | { type: 'append_text'; text: string }
    | { type: 'replace_block'; blockIndex: number; html: string }
    | { type: 'freeze_block'; blockIndex: number }
    | { type: 'append_block'; html: string; blockIndex: number }
    | { type: 'fallback_plaintext'; reason: string }

/** Final rendered snapshot for history messages */
export interface FinalSnapshot {
    html: string
    sanitizerRemoved: boolean
}
