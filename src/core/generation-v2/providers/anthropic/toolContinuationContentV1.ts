export type AnthropicToolResultBlockV1 = Readonly<{
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error: boolean
}>

export type AnthropicToolResultMessageV1 = Readonly<{
  role: 'user'
  content: readonly AnthropicToolResultBlockV1[]
}>

export function createAnthropicToolResultMessageV1(
  outputs: readonly Readonly<{ toolUseId: string; content: string; isError: boolean }>[],
): AnthropicToolResultMessageV1 {
  return Object.freeze({
    role: 'user' as const,
    content: Object.freeze(outputs.map((output) => Object.freeze({
      type: 'tool_result' as const,
      tool_use_id: output.toolUseId,
      content: output.content,
      is_error: output.isError,
    }))),
  })
}
