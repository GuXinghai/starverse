import type { CompatibleJsonValue } from '../request/messageTypes'

export type CompatibleToolAggregateStatus = 'streaming' | 'complete' | 'malformed' | 'incomplete'
export type CompatibleToolExecutionState = 'not_executed'
export type CompatibleToolDiagnosticCode =
  | 'tool_sequence_conflict'
  | 'tool_sequence_out_of_order'
  | 'tool_fragment_after_final'
  | 'tool_type_conflict'
  | 'tool_id_overflow'
  | 'tool_id_duplicate'
  | 'tool_name_overflow'
  | 'tool_arguments_overflow'
  | 'tool_finish_reason_mismatch'
  | 'tool_id_missing'
  | 'tool_type_missing'
  | 'tool_name_missing'
  | 'tool_arguments_missing'
  | 'tool_arguments_malformed'
  | 'tool_arguments_not_object'

export type CompatibleToolAggregate = Readonly<{
  routeProvenanceId: string
  messageId: string
  choiceIndex: number
  toolIndex: number
  toolCallId: string | null
  toolType: 'function' | null
  functionName: string | null
  argumentsText: string
  argumentsObserved: boolean
  argumentsJson: string | null
  status: CompatibleToolAggregateStatus
  diagnosticCode: CompatibleToolDiagnosticCode | null
  executionState: CompatibleToolExecutionState
  sequenceStart: number
  sequenceEnd: number
}>

export type CompatibleToolSafeView = Readonly<{
  toolIndex: number
  toolCallId: string | null
  functionName: string | null
  argumentsText: string
  parsedArguments: CompatibleJsonValue | null
  status: CompatibleToolAggregateStatus
  diagnosticCode: CompatibleToolDiagnosticCode | null
  executionState: 'not_executed'
  sequenceStart: number
  sequenceEnd: number
}>

export class CompatibleToolContractError extends Error {
  readonly code: CompatibleToolDiagnosticCode

  constructor(code: CompatibleToolDiagnosticCode) {
    super(code)
    this.name = 'CompatibleToolContractError'
    this.code = code
  }
}
