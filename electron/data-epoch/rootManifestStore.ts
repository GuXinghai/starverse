import {
  createEpoch2RootManifest,
  decodeAndVerifyEpoch2RootManifest,
  type Epoch2RootManifest,
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import {
  assertWin32EpochRootLeaseAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    throw new Error('EPOCH2_ROOT_MANIFEST_INVALID')
  }
}

function serialized(manifest: Epoch2RootManifest): Uint8Array {
  return encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`)
}

function assertAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): void {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  createEpoch2RootManifest({ layout: input.layout })
}

export function writeEpoch2TransitionOwnershipManifestAtomic(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  manifest: Epoch2RootManifest
}>): void {
  assertAuthority(input)
  const verified = createEpoch2RootManifest({ layout: input.layout })
  if (JSON.stringify(verified) !== JSON.stringify(input.manifest)) {
    throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
  }
  const currentBytes = input.lease.readTransitionFile('transition_manifest')
  if (currentBytes !== null) {
    const current = decodeAndVerifyEpoch2RootManifest({
      value: decodeJson(currentBytes),
      layout: input.layout,
    })
    if (JSON.stringify(current) !== JSON.stringify(input.manifest)) {
      throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
    }
    return
  }
  const publication = input.lease.writeTransitionFile('transition_manifest', serialized(verified))
  if (publication === 'exists') {
    const racedBytes = input.lease.readTransitionFile('transition_manifest')
    if (racedBytes === null) throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
    const raced = decodeAndVerifyEpoch2RootManifest({
      value: decodeJson(racedBytes),
      layout: input.layout,
    })
    if (JSON.stringify(raced) !== JSON.stringify(verified)) {
      throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
    }
  }
}

export function readAndVerifyEpoch2TransitionOwnershipManifest(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2RootManifest {
  assertAuthority(input)
  const bytes = input.lease.readTransitionFile('transition_manifest')
  if (bytes === null) throw new Error('EPOCH2_ROOT_MANIFEST_MISSING')
  return decodeAndVerifyEpoch2RootManifest({
    value: decodeJson(bytes),
    layout: input.layout,
  })
}
