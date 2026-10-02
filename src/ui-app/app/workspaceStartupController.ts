import { readonly, shallowRef } from 'vue'

export type WorkspaceStartupError = 'bridge_unavailable' | 'initialization_failed' | 'superseded'
export type WorkspaceStartupState = Readonly<{
  phase: 'loading' | 'ready' | 'error'
  attempt: number
  error: WorkspaceStartupError | null
}>

export type WorkspaceStartupLease = Readonly<{
  attempt: number
  isCurrent: () => boolean
  assertCurrent: () => void
}>

export class WorkspaceStartupSupersededError extends Error {
  constructor() { super('WORKSPACE_STARTUP_SUPERSEDED') }
}

type TemplateResetIdentity = Readonly<{
  templateConversationId: string
  resetModelConfig: boolean
  resetDraftAttachments: boolean
}>

function resetKey(input: TemplateResetIdentity): string {
  if (!input.templateConversationId.trim() || input.templateConversationId.trim() !== input.templateConversationId) {
    throw new Error('WORKSPACE_STARTUP_TEMPLATE_REVISION_INVALID')
  }
  return JSON.stringify([input.templateConversationId, input.resetModelConfig, input.resetDraftAttachments])
}

function validRevision(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 }

function startupError(error: unknown): WorkspaceStartupError {
  if (error instanceof WorkspaceStartupSupersededError) return 'superseded'
  if (error instanceof Error && (error.message === 'GENERATION_V2_WORKSPACE_BRIDGE_UNAVAILABLE' ||
      error.message === 'WORKSPACE_STARTUP_BRIDGE_UNAVAILABLE')) return 'bridge_unavailable'
  return 'initialization_failed'
}

/** Attempt state and acknowledged startup effects; persisted workspace data remains in its existing authorities. */
export function createWorkspaceStartupController(input: Readonly<{
  initialize: (lease: WorkspaceStartupLease) => Promise<void>
}>) {
  const state = shallowRef<WorkspaceStartupState>({ phase: 'loading', attempt: 0, error: null })
  const acknowledgedResets = new Map<string, number>()
  let revision = 0
  let disposed = false
  let pending: Promise<void> | null = null

  function run(): Promise<void> {
    if (pending) return pending
    if (disposed || state.value.phase === 'ready') return Promise.resolve()
    const attempt = ++revision
    const isCurrent = () => !disposed && revision === attempt
    const lease = Object.freeze({ attempt, isCurrent, assertCurrent: () => {
      if (!isCurrent()) throw new WorkspaceStartupSupersededError()
    } })
    state.value = Object.freeze({ phase: 'loading', attempt, error: null })
    // Assign the pending operation before invoking the callback, including synchronous retries.
    const operation = Promise.resolve().then(() => input.initialize(lease)).then(() => {
      if (isCurrent()) state.value = Object.freeze({ phase: 'ready', attempt, error: null })
    }, error => {
      if (isCurrent()) state.value = Object.freeze({ phase: 'error', attempt, error: startupError(error) })
    })
    pending = operation
    void operation.then(() => { if (pending === operation) pending = null })
    return operation
  }

  return Object.freeze({
    state: readonly(state),
    run,
    retry: run,
    dispose: () => { disposed = true; revision += 1 },
    hasAcknowledgedTemplateReset: (value: TemplateResetIdentity & Readonly<{ templateRevision: number }>): boolean => {
      if (!validRevision(value.templateRevision)) throw new Error('WORKSPACE_STARTUP_TEMPLATE_REVISION_INVALID')
      const acknowledged = acknowledgedResets.get(resetKey(value))
      if (acknowledged !== undefined && value.templateRevision < acknowledged) {
        throw new Error('WORKSPACE_STARTUP_TEMPLATE_REVISION_INVALID')
      }
      return acknowledged !== undefined
    },
    acknowledgeTemplateReset: (value: TemplateResetIdentity & Readonly<{
      expectedTemplateRevision: number; acknowledgedTemplateRevision: number
    }>): void => {
      if (!validRevision(value.expectedTemplateRevision) || !validRevision(value.acknowledgedTemplateRevision) ||
          value.acknowledgedTemplateRevision !== value.expectedTemplateRevision + 1) {
        throw new Error('WORKSPACE_STARTUP_TEMPLATE_REVISION_INVALID')
      }
      // A committed reset must be remembered even if its attempt was disposed while awaiting the acknowledgement.
      acknowledgedResets.set(resetKey(value), value.acknowledgedTemplateRevision)
    },
  })
}
