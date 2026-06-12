/**
 * Test-only invariant helpers for provider fixture testing.
 *
 * These helpers capture recurring provider-runtime invariants:
 * - terminal event semantics
 * - no stream.done after stream.error
 * - unexpected EOF as protocol error
 * - no visible-text leakage from unsupported fields
 * - no raw credential leakage in errors/events
 *
 * NOT a production abstraction. Test-only utility.
 */

import { expect } from 'vitest'
import type { StarverseStreamEvent, StarverseProviderError } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Event collection
// ---------------------------------------------------------------------------

/**
 * Collect all events from an async generator into an array.
 * Universal helper for all provider adapter test suites.
 */
export async function collectStreamEvents(
  gen: AsyncGenerator<StarverseStreamEvent>,
): Promise<StarverseStreamEvent[]> {
  const events: StarverseStreamEvent[] = []
  for await (const ev of gen) { events.push(ev) }
  return events
}

// ---------------------------------------------------------------------------
// Terminal event invariants
// ---------------------------------------------------------------------------

/**
 * Assert that events contain exactly one terminal event (stream.done or stream.error)
 * and that it is the last event.
 */
export function assertExactlyOneTerminalEvent(events: StarverseStreamEvent[]): void {
  const doneEvents = events.filter((e) => e.type === 'stream.done')
  const errorEvents = events.filter((e) => e.type === 'stream.error')
  const terminalCount = doneEvents.length + errorEvents.length
  expect(terminalCount).toBe(1)

  const lastEvent = events[events.length - 1]
  expect(lastEvent.type === 'stream.done' || lastEvent.type === 'stream.error').toBe(true)
}

/**
 * Assert that no stream.done appears after a stream.error.
 * This is a critical invariant: error is terminal, done must not follow.
 */
export function assertNoDoneAfterError(events: StarverseStreamEvent[]): void {
  let errorSeen = false
  for (const ev of events) {
    if (ev.type === 'stream.error') errorSeen = true
    if (errorSeen && ev.type === 'stream.done') {
      expect.fail('stream.done must not appear after stream.error')
    }
  }
}

/**
 * Assert happy path: text events present, exactly one stream.done at end.
 */
export function assertHappyPathTerminal(events: StarverseStreamEvent[]): void {
  const textEvents = events.filter((e) => e.type === 'message.text_delta')
  expect(textEvents.length).toBeGreaterThan(0)

  const doneEvents = events.filter((e) => e.type === 'stream.done')
  expect(doneEvents).toHaveLength(1)
  expect(events[events.length - 1].type).toBe('stream.done')
}

/**
 * Assert error path: stream.error present, no stream.done.
 */
export function assertErrorPathTerminal(events: StarverseStreamEvent[]): void {
  const errorEvents = events.filter((e) => e.type === 'stream.error')
  expect(errorEvents.length).toBeGreaterThan(0)

  const doneEvents = events.filter((e) => e.type === 'stream.done')
  expect(doneEvents).toHaveLength(0)

  assertNoDoneAfterError(events)
}

/**
 * Assert EOF path: protocol error, no stream.done.
 */
export function assertEofPathTerminal(events: StarverseStreamEvent[]): void {
  assertErrorPathTerminal(events)

  const errorEvents = events.filter((e) => e.type === 'stream.error')
  const protocolErrors = errorEvents.filter(
    (e) => e.type === 'stream.error' && e.error.category === 'protocol',
  )
  expect(protocolErrors.length).toBeGreaterThan(0)
}

/**
 * Assert abort path: stream.abort present, no stream.done.
 */
export function assertAbortPathTerminal(events: StarverseStreamEvent[]): void {
  const abortEvents = events.filter((e) => e.type === 'stream.abort')
  expect(abortEvents.length).toBeGreaterThan(0)

  const doneEvents = events.filter((e) => e.type === 'stream.done')
  expect(doneEvents).toHaveLength(0)
}

// ---------------------------------------------------------------------------
// Error shape invariants
// ---------------------------------------------------------------------------

/**
 * Assert that a StarverseProviderError has the required fields
 * and is safe for renderer consumption.
 */
export function assertValidProviderError(error: StarverseProviderError): void {
  expect(typeof error.phase).toBe('string')
  expect(error.phase.length).toBeGreaterThan(0)

  expect(typeof error.provider).toBe('string')
  expect(error.provider.length).toBeGreaterThan(0)

  expect(typeof error.category).toBe('string')
  expect([
    'auth', 'rate_limit', 'bad_request', 'network', 'http',
    'provider_error', 'protocol', 'aborted', 'unknown',
  ]).toContain(error.category)

  expect(typeof error.message).toBe('string')
  expect(error.message.length).toBeGreaterThan(0)
}

/**
 * Assert that terminal stream.error events have valid error shapes.
 */
export function assertTerminalErrorsValid(events: StarverseStreamEvent[]): void {
  for (const ev of events) {
    if (ev.type === 'stream.error') {
      expect(ev.terminal).toBe(true)
      assertValidProviderError(ev.error)
    }
  }
}

// ---------------------------------------------------------------------------
// Content leakage invariants
// ---------------------------------------------------------------------------

/**
 * Assert that visible text events do not contain forbidden substrings.
 * Used to verify that tool_calls, reasoning_content, thought, functionCall, etc.
 * do not leak into visible text.
 */
export function assertNoVisibleTextContains(
  events: StarverseStreamEvent[],
  forbiddenSubstrings: string[],
): void {
  const textEvents = events.filter((e) => e.type === 'message.text_delta')
  for (const ev of textEvents) {
    if (ev.type === 'message.text_delta') {
      for (const forbidden of forbiddenSubstrings) {
        expect(ev.text).not.toContain(forbidden)
      }
    }
  }
}

/**
 * Assert that reasoning events do not appear as visible text.
 * For providers that separate reasoning from visible text.
 */
export function assertReasoningNotInVisibleText(events: StarverseStreamEvent[]): void {
  const reasoningTexts: string[] = []

  // Collect reasoning content from reasoning_detail events
  for (const ev of events) {
    if (ev.type === 'message.reasoning_detail' && ev.detail) {
      const detail = ev.detail as any
      if (typeof detail.text === 'string') reasoningTexts.push(detail.text)
    }
    if (ev.type === 'message.reasoning_detail_batch' && ev.details) {
      for (const d of ev.details as any[]) {
        if (typeof d?.text === 'string') reasoningTexts.push(d.text)
      }
    }
  }

  // If there are reasoning events, their content must not appear in visible text
  const textEvents = events.filter((e) => e.type === 'message.text_delta')
  for (const reasoningText of reasoningTexts) {
    for (const textEv of textEvents) {
      if (textEv.type === 'message.text_delta') {
        expect(textEv.text).not.toContain(reasoningText)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Credential leakage invariants
// ---------------------------------------------------------------------------

/**
 * Assert that serialized events do not contain raw credential material.
 * Tests exact token, Bearer pattern, and Authorization pattern.
 */
export function assertNoCredentialLeakage(
  events: StarverseStreamEvent[],
  rawToken: string,
): void {
  const serialized = JSON.stringify(events)
  expect(serialized).not.toContain(rawToken)

  // Also check that no Bearer <token> pattern exists
  if (rawToken.length > 0) {
    expect(serialized).not.toContain(`Bearer ${rawToken}`)
    expect(serialized).not.toContain(`Authorization: Bearer ${rawToken}`)
  }
}

/**
 * Assert that a validation error does not contain raw credential material.
 */
export function assertErrorNoCredentialLeakage(
  error: StarverseProviderError,
  rawToken: string,
): void {
  const serialized = JSON.stringify(error)
  expect(serialized).not.toContain(rawToken)
}
