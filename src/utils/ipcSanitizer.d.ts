export type SanitizedValue = string | number | boolean | null | undefined | SanitizedValue[] | { [key: string]: SanitizedValue }

export function sanitizeForIpc<T>(input: T): SanitizedValue

export function sanitizeMessageMetadata<T>(metadata: T): Record<string, any> | undefined
