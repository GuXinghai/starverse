export type CapabilityBoundGenerationCommandV2 = Readonly<{
  command: unknown
  expectedCapabilityRevision: string
}>

export class CapabilityBoundGenerationCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_CAPABILITY_BOUND_COMMAND_INVALID') {
    super(code)
    this.name = 'CapabilityBoundGenerationCommandV2Error'
  }
}

export function decodeCapabilityBoundGenerationCommandV2(
  value: unknown,
): CapabilityBoundGenerationCommandV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new CapabilityBoundGenerationCommandV2Error('GENERATION_V2_CAPABILITY_BOUND_COMMAND_INVALID')
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 2 || keys[0] !== 'command' || keys[1] !== 'expectedCapabilityRevision' ||
      !record.command || typeof record.command !== 'object' || Array.isArray(record.command) ||
      Object.getPrototypeOf(record.command) !== Object.prototype ||
      typeof record.expectedCapabilityRevision !== 'string' ||
      record.expectedCapabilityRevision.length === 0 ||
      record.expectedCapabilityRevision.trim() !== record.expectedCapabilityRevision) {
    throw new CapabilityBoundGenerationCommandV2Error('GENERATION_V2_CAPABILITY_BOUND_COMMAND_INVALID')
  }
  return Object.freeze({ command: record.command, expectedCapabilityRevision: record.expectedCapabilityRevision })
}
