import { describe, expect, it } from 'vitest'
import { publishGenerationStreamProjectionV2 } from './generationStreamProjectionV2'

describe('generation stream projection V2', () => {
  it('publishes an immutable downstream copy', () => {
    let observed: unknown
    publishGenerationStreamProjectionV2({ publish: (projection) => { observed = projection } }, {
      type: 'assistant_body', operationId: 'operation:1', answerRootId: 'answer:1', content: 'partial',
    })
    expect(observed).toEqual({
      type: 'assistant_body', operationId: 'operation:1', answerRootId: 'answer:1', content: 'partial',
    })
    expect(Object.isFrozen(observed)).toBe(true)
  })

  it('does not let a projection observer change the generation authority', () => {
    expect(() => publishGenerationStreamProjectionV2({
      publish: () => { throw new Error('renderer disconnected') },
    }, {
      type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:1',
      state: 'failed', errorCode: 'network_failed', errorMessage: 'Network failed.',
    })).not.toThrow()
  })
})
