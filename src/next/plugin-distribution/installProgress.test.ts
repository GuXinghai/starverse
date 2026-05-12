import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toInstallProgressDto } from './index'

const HASH = 'a'.repeat(64)

describe('toInstallProgressDto', () => {
  it('omits absolute paths from progress DTO', () => {
    const dto = toInstallProgressDto({
      operationId: 'op-1',
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      phase: 'failed',
      diagnostic: 'failed at C:\\Users\\owner\\plugin',
    })
    expect(JSON.stringify(dto)).not.toContain('C:\\Users\\owner')
  })

  it('omits raw URLs from progress DTO', () => {
    const dto = toInstallProgressDto({
      operationId: 'op-https://plugins.starverse.local/pkg.svpkg',
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      phase: 'downloading',
      diagnostic: 'https://plugins.starverse.local/pkg.svpkg',
    })
    expect(JSON.stringify(dto)).not.toContain('https://')
    expect(JSON.stringify(dto)).not.toContain('plugins.starverse.local')
  })

  it('omits raw hashes and signatures from progress DTO', () => {
    const dto = toInstallProgressDto({
      operationId: 'op-1',
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      phase: 'verifying',
      errorCode: `signature_${HASH}`,
      diagnostic: `fullHash=${HASH}`,
    })
    const serialized = JSON.stringify(dto)
    expect(serialized).not.toContain(HASH)
    expect(serialized).not.toContain('fullHash=')
  })

  it('sanitizes failure DTO fields', () => {
    const dto = toInstallProgressDto({
      operationId: 'op-1',
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      phase: 'failed',
      percent: 142,
      bytesReceived: 11 * 1024 * 1024,
      failureReason: 'install_interrupted at C:\\Users\\owner\\stage',
    })
    expect(dto.percent).toBe(100)
    expect(dto.bytesReceivedBucket).toBe('gte_10mb')
    expect(JSON.stringify(dto)).not.toContain('C:\\Users\\owner')
  })

  it('sanitizes key-value paths in failure DTO fields', () => {
    const dto = toInstallProgressDto({
      operationId: 'op-1',
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      phase: 'failed',
      diagnostic: 'install failed path=/opt/starverse/plugin',
    })
    expect(JSON.stringify(dto)).not.toContain('/opt/starverse/plugin')
  })

  it('documents no marketplace, auto-update, execution, or extraction overclaim', () => {
    const closeout = readFileSync(
      join(process.cwd(), 'docs/file-pipeline/plugin-distribution/05-pdp-phase4-verified-downloader-installer-closeout.md'),
      'utf8'
    )
    expect(closeout).toContain('Actual archive extraction/unpack remains deferred')
    expect(closeout).toContain('plugin runtime execution remain out of scope')
    expect(closeout).not.toMatch(/marketplace UI (is )?implemented/iu)
    expect(closeout).not.toMatch(/auto-update (is )?implemented/iu)
    expect(closeout).not.toMatch(/plugin execution (is )?enabled/iu)
    expect(closeout).not.toMatch(/archive extraction (is )?complete/iu)
  })
})
