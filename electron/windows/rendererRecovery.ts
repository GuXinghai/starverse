export type RendererFailure = Readonly<
  | { kind: 'renderer-crashed'; reason: string; exitCode: number }
  | { kind: 'load-failed'; errorCode: number; errorDescription: string; target: string }
>

export type RecoveryChoiceId = 'reload' | 'restart' | 'close'

export type RecoveryPrompt = Readonly<{
  failure: RendererFailure
  /** Reload is withheld when the previous reload already failed within the loop window. */
  reloadAllowed: boolean
}>

export type RendererRecoveryDeps = Readonly<{
  /** Resolves with the user's explicit choice; `null` means the prompt could not be shown. */
  promptUser: (prompt: RecoveryPrompt) => Promise<RecoveryChoiceId | null>
  reloadRenderer: () => void
  restartApp: () => void
  closeApp: () => void
  log: (event: string, details: Record<string, unknown>) => void
  now?: () => number
  /** A failure this soon after a user-chosen reload is treated as a crash loop. */
  loopWindowMs?: number
}>

export type RendererRecovery = Readonly<{
  handleFailure: (failure: RendererFailure) => Promise<void>
}>

export const RENDERER_RECOVERY_LOOP_WINDOW_MS = 30_000

// Reasons that mean the renderer ended on purpose, not by failure.
const BENIGN_GONE_REASONS: ReadonlySet<string> = new Set(['clean-exit'])
// Chromium net::ERR_ABORTED: superseded or cancelled navigation, not a load failure.
const ERR_ABORTED = -3

export function classifyRenderProcessGone(details: { reason: string; exitCode: number }): RendererFailure | null {
  if (BENIGN_GONE_REASONS.has(details.reason)) return null
  return { kind: 'renderer-crashed', reason: details.reason, exitCode: details.exitCode }
}

export function classifyDidFailLoad(input: {
  errorCode: number
  errorDescription: string
  isMainFrame: boolean
  target: string
}): RendererFailure | null {
  if (!input.isMainFrame || input.errorCode === ERR_ABORTED) return null
  return {
    kind: 'load-failed',
    errorCode: input.errorCode,
    errorDescription: input.errorDescription,
    target: input.target,
  }
}

export function createRendererRecovery(deps: RendererRecoveryDeps): RendererRecovery {
  const now = deps.now ?? Date.now
  const loopWindowMs = deps.loopWindowMs ?? RENDERER_RECOVERY_LOOP_WINDOW_MS
  let prompting = false
  let lastReloadAt: number | null = null

  const handleFailure = async (failure: RendererFailure): Promise<void> => {
    // Log first, always, even if a prompt is already open.
    const reloadAllowed = lastReloadAt === null || now() - lastReloadAt >= loopWindowMs
    deps.log('RENDERER_FAILURE', { ...failure, reloadAllowed })
    if (prompting) return
    prompting = true
    let choice: RecoveryChoiceId | null
    try {
      choice = await deps.promptUser({ failure, reloadAllowed })
    } catch {
      choice = null
    } finally {
      prompting = false
    }

    if (choice === null) {
      deps.log('RENDERER_RECOVERY_PROMPT_UNAVAILABLE', {})
      return
    }
    deps.log('RENDERER_RECOVERY_CHOICE', { choice })
    if (choice === 'reload') {
      if (!reloadAllowed) return
      lastReloadAt = now()
      deps.reloadRenderer()
    } else if (choice === 'restart') {
      deps.restartApp()
    } else {
      deps.closeApp()
    }
  }

  return { handleFailure }
}
