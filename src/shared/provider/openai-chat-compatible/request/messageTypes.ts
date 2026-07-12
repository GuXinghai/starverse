export type CompatibleJsonValue = null | boolean | number | string | CompatibleJsonValue[] | { [key: string]: CompatibleJsonValue }

export type CompatibleRequestContentPart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image_url'; image_url: Readonly<{ url: string; detail?: 'auto' | 'low' | 'high' }> }>

export type CompatibleRequestToolCall = Readonly<{
  id: string
  type: 'function'
  function: Readonly<{ name: string; arguments: string }>
}>

export type CompatibleRequestMessage =
  | Readonly<{ role: 'system' | 'developer' | 'user'; content: string | readonly CompatibleRequestContentPart[] }>
  | Readonly<{ role: 'assistant'; content: string | readonly CompatibleRequestContentPart[] | null; tool_calls?: readonly CompatibleRequestToolCall[] }>
  | Readonly<{ role: 'tool'; tool_call_id: string; content: string }>

export type CompatibleFunctionTool = Readonly<{
  type: 'function'
  function: Readonly<{
    name: string
    description?: string
    parameters: CompatibleJsonValue
    strict?: boolean
  }>
}>

export type CompatibleFieldState<Value> =
  | Readonly<{ state: 'unset' }>
  | Readonly<{ state: 'explicit'; value: Value }>
  | Readonly<{ state: 'profile_default' }>

export type CompatibleReasoningControlState = Readonly<{
  reasoning_enabled?: CompatibleFieldState<boolean>
  reasoning_effort?: CompatibleFieldState<string>
  reasoning_budget?: CompatibleFieldState<number>
}>
