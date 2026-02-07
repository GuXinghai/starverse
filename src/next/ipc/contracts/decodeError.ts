import { ZodError, type ZodType } from 'zod'
import type { AppError } from '@/next/errors/appError'
import { normalizeProtocolError } from '@/next/errors/normalizeOpenRouterError'

export class IpcContractDecodeError extends Error {
  readonly method: string
  readonly appError: AppError
  readonly issues: string[]
  readonly raw: unknown

  constructor(input: Readonly<{ method: string; raw: unknown; issues: string[] }>) {
    const appError = normalizeProtocolError(
      {
        code: 'protocol_invalid',
        message: `IPC decode failed for ${input.method}`,
      },
      {
        method: input.method,
        issues: input.issues,
        raw: input.raw,
      }
    )
    super(appError.message)
    this.name = 'IpcContractDecodeError'
    this.method = input.method
    this.appError = appError
    this.issues = input.issues
    this.raw = input.raw
  }
}

function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
    return `${path}: ${issue.message}`
  })
}

export function decodeWithSchema<T>(
  method: string,
  schema: ZodType<T, any, unknown>,
  raw: unknown
): T {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data
  throw new IpcContractDecodeError({
    method,
    raw,
    issues: formatIssues(parsed.error),
  })
}
