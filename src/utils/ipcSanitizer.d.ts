/**
 * IPC Sanitizer - Type definitions for cross-process data serialization
 * 
 * Security boundary for Electron IPC communication. Ensures all data passed
 * through IPC channels is safe from Vue Proxy pollution, circular references,
 * and unsupported types that break structured cloning.
 * 
 * @module ipcSanitizer
 */

import type { MessageVersionMetadata } from '../types/chat'

/**
 * Recursively sanitized value that can safely cross IPC boundary.
 * Guaranteed to be structured-clone compatible (no functions, symbols, proxies, or circular refs).
 */
export type SanitizedValue = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | SanitizedValue[] 
  | { [key: string]: SanitizedValue }

/**
 * Metadata structure from AI providers (OpenRouter, Gemini).
 * After sanitization, contains only JSON-safe primitives.
 */
export interface MessageMetadata {
  /** Usage statistics (tokens, cost, etc.) */
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    /** Cost breakdown (sanitized, raw field removed) */
    cost_details?: {
      prompt_cost?: number
      completion_cost?: number
      total_cost?: number
      [key: string]: SanitizedValue
    }
    [key: string]: SanitizedValue
  }
  /** AI provider identifier */
  provider?: string
  /** Model identifier */
  model?: string
  /** Generation ID for async usage tracking (OpenRouter) */
  generationId?: string
  /** Reasoning process data (OpenRouter) */
  reasoning?: {
    summary?: string
    details?: Array<{
      type: string
      content: string
    }>
  }
  [key: string]: SanitizedValue
}

/**
 * Recursively sanitize a value for IPC transmission.
 * 
 * **Transformations**:
 * - Vue Proxy → toRaw()
 * - Date → ISO string
 * - RegExp → string representation
 * - Map → plain object
 * - Set → array
 * - ArrayBuffer/TypedArray → number array
 * - Circular refs → detected via WeakMap, replaced with placeholder
 * - Functions/Symbols → undefined (removed from objects/arrays)
 * - BigInt → string
 * - Custom objects with toJSON() → JSON representation
 * 
 * @template T - Input type (may contain Vue proxies, complex objects)
 * @param input - Value to sanitize
 * @returns Sanitized value safe for structured cloning
 * 
 * @example
 * ```typescript
 * // Vue reactive object → plain object
 * const store = reactive({ count: 1 })
 * const safe = sanitizeForIpc(store) // { count: 1 }
 * 
 * // Circular reference handling
 * const obj: any = { name: 'test' }
 * obj.self = obj
 * sanitizeForIpc(obj) // { name: 'test', self: {...} } (no infinite loop)
 * ```
 */
export function sanitizeForIpc<T>(input: T): SanitizedValue

/**
 * Specialized sanitizer for AI message metadata.
 * 
 * **Additional safety measures**:
 * - Removes `usage.raw` field (heavy/unsafe)
 * - Deep-sanitizes nested `cost_details`
 * - Returns undefined if metadata is empty after cleaning
 * 
 * @template T - Metadata input type (usually Record<string, any>)
 * @param metadata - Raw metadata from AI provider
 * @returns Sanitized metadata or undefined if empty/invalid
 * 
 * @example
 * ```typescript
 * const rawMeta = {
 *   usage: {
 *     prompt_tokens: 10,
 *     raw: {} // heavy object removed
 *   }
 * }
 * sanitizeMessageMetadata(rawMeta) 
 * // Returns: { usage: { prompt_tokens: 10 } }
 * ```
 */
export function sanitizeMessageMetadata<T = Record<string, any> | null | undefined>(
  metadata: T
): MessageVersionMetadata | undefined
