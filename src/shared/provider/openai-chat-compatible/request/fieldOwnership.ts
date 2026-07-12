import type { CompatibleJsonValue } from './messageTypes'

export type CompatibleOwnedPath = Readonly<{
  path: readonly (string | number)[]
  owner: 'builder' | 'mapping' | 'extra_body'
  state: 'explicit' | 'profile_default'
}>

export function assertCompatiblePathAvailable(
  candidate: readonly (string | number)[],
  owner: CompatibleOwnedPath['owner'],
  existing: readonly CompatibleOwnedPath[],
): void {
  for (const entry of existing) {
    if (pathsOverlap(candidate, entry.path)) {
      throw new Error(`compatible_request_path_conflict:${formatPath(candidate)}:${owner}:${entry.owner}`)
    }
  }
}

export function setCompatibleJsonPath(
  target: Record<string, CompatibleJsonValue>,
  path: readonly (string | number)[],
  value: CompatibleJsonValue,
): void {
  let cursor: CompatibleJsonValue = target
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]!
    const last = index === path.length - 1
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) throw new Error('compatible_request_mapping_invalid')
      if (last) cursor[segment] = value
      else cursor = cursor[segment] ??= typeof path[index + 1] === 'number' ? [] : {}
    } else {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) throw new Error('compatible_request_mapping_invalid')
      const object = cursor as Record<string, CompatibleJsonValue>
      if (last) object[segment] = value
      else object[segment] = object[segment] ?? (typeof path[index + 1] === 'number' ? [] : {})
      cursor = object[segment]!
    }
  }
}

export function enumerateCompatibleJsonPaths(value: CompatibleJsonValue, prefix: readonly (string | number)[] = []): readonly (readonly (string | number)[])[] {
  if (!value || typeof value !== 'object') return [prefix]
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item] as const) : Object.entries(value)
  if (entries.length === 0) return [prefix]
  return entries.flatMap(([key, child]) => enumerateCompatibleJsonPaths(child, [...prefix, key]))
}

function pathsOverlap(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return false
  return true
}

function formatPath(path: readonly (string | number)[]): string {
  return path.map(String).join('.')
}
