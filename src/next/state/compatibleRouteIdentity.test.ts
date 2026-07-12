import { describe, expect, it } from 'vitest'
import { createInitialState, startGeneration } from './reducerAdapter'
import { selectMessage, selectRun } from './selectors'

describe('compatible route identity in provider-neutral state', () => {
  it('carries route and choice identity from generation state to view models', () => {
    const started = startGeneration(createInitialState(), {
      runId: 'run-1',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      routeProvenanceId: 'ocp_route_12345678',
      choiceIndex: 2,
    })

    expect(selectRun(started.state, 'run-1')).toMatchObject({ routeProvenanceId: 'ocp_route_12345678' })
    expect(selectMessage(started.state, 'assistant-1')).toMatchObject({
      routeProvenanceId: 'ocp_route_12345678',
      choiceIndex: 2,
    })
  })
})
