export function stripTiming<T extends { type?: string }>(events: T[]): T[] {
  return events.filter((e) => e?.type !== 'TimingSnapshot')
}

export function firstOfType<T extends { type?: string }>(events: T[], type: string): T | undefined {
  return events.find((e) => e?.type === type)
}

export function eventsOfType<T extends { type?: string }>(events: T[], type: string): T[] {
  return events.filter((e) => e?.type === type)
}
