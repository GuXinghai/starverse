import type { DbErrorCode, DbErrorShape } from './types.js'

export class DbWorkerError extends Error {
  constructor(
    public code: DbErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'DbWorkerError'
  }
}

export const toErrorShape = (error: unknown): DbErrorShape => {
  if (error instanceof DbWorkerError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    }
  }

  if (error instanceof Error) {
    return {
      code: 'ERR_INTERNAL',
      message: error.message
    }
  }

  return {
    code: 'ERR_INTERNAL',
    message: 'Unknown database error'
  }
}

export const assert = (condition: any, message: string, code: DbErrorCode = 'ERR_VALIDATION'): asserts condition => {
  if (!condition) {
    throw new DbWorkerError(code, message)
  }
}
