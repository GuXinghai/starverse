import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareAgentProfile, resolveAgentProfilePaths } from './electron-agent.mjs'

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.basename(root).startsWith('starverse-agent-launcher-') || path.dirname(root) !== os.tmpdir()) {
      throw new Error('Unexpected fixture cleanup path')
    }
    await fs.rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'starverse-agent-launcher-'))
  roots.push(root)
  return resolveAgentProfilePaths({ root, profile: 'reuse' })
}

describe('agent profile launcher', () => {
  it('refuses repository paths before creating a profile', () => {
    expect(() => resolveAgentProfilePaths({ root: process.cwd(), profile: 'test' })).toThrow('outside the repository')
    expect(() => resolveAgentProfilePaths({ profile: '../normal-data' })).toThrow('Invalid profile name')
  })
  it('preserves reusable data and rejects a duplicate live launcher', async () => {
    const profile = await fixture()
    await prepareAgentProfile(profile)
    await fs.writeFile(path.join(profile.profileRoot, 'preserved.txt'), 'keep this state')
    await expect(prepareAgentProfile(profile)).rejects.toMatchObject({ code: 'EEXIST' })
    await fs.unlink(profile.lock)
    await prepareAgentProfile(profile)
    expect(await fs.readFile(path.join(profile.profileRoot, 'preserved.txt'), 'utf8')).toBe('keep this state')
  })
  it('does not adopt or overwrite an unowned nonempty directory', async () => {
    const profile = await fixture()
    await fs.mkdir(profile.profileRoot)
    await fs.writeFile(path.join(profile.profileRoot, 'existing.txt'), 'original')
    await expect(prepareAgentProfile(profile)).rejects.toThrow('unowned, nonempty')
    expect(await fs.readFile(path.join(profile.profileRoot, 'existing.txt'), 'utf8')).toBe('original')
  })
})
