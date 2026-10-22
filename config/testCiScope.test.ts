import { describe, expect, it } from 'vitest'
import { resolveTestCiScope } from '../scripts/resolve-test-ci-scope.mjs'

describe('test CI scope classifier', () => {
  it('leaves optional partitions off for documentation-only changes', () => {
    expect(resolveTestCiScope(['README.md', 'docs/maintenance/test-strategy.md'])).toMatchObject({
      ui: false, integration: false,
    })
  })

  it('runs only UI for UI source changes', () => {
    expect(resolveTestCiScope(['src/ui-app/components/ModelPickerDialog.vue'])).toMatchObject({
      ui: true, integration: false,
    })
  })

  it('runs only integration for Electron/native changes', () => {
    expect(resolveTestCiScope(['electron/data-epoch/win32EpochRootLease.ts'])).toMatchObject({
      ui: false, integration: true,
    })
  })

  it('runs both partitions for shared test infrastructure', () => {
    expect(resolveTestCiScope(['package-lock.json'])).toMatchObject({ ui: true, integration: true })
  })

  it('does not schedule routine partitions for slow-only changes', () => {
    expect(resolveTestCiScope(['infra/files/dfcLibreOfficePdfAdapter.slow.test.ts'])).toMatchObject({
      ui: false, integration: false,
    })
  })

  it('uses partition overrides for cross-directory tests', () => {
    expect(resolveTestCiScope(['src/next/modelPrefs/modelPrefsService.test.ts'])).toMatchObject({
      ui: true, integration: false,
    })
    expect(resolveTestCiScope(['src/next/file-type/ffprobeRunner.test.ts'])).toMatchObject({
      ui: false, integration: true,
    })
  })

  it('uses partition overrides for the production source owned by an overridden test', () => {
    expect(resolveTestCiScope(['src/next/modelPrefs/modelPrefsService.ts'])).toMatchObject({
      ui: true, integration: false,
    })
    expect(resolveTestCiScope(['src/next/file-type/magikaManagedPlugin.ts'])).toMatchObject({
      ui: false, integration: true,
    })
    expect(resolveTestCiScope(['tools/provider-key-vault/index.mjs'])).toMatchObject({
      ui: false, integration: true,
    })
    expect(resolveTestCiScope(['tools/provider-key-vault/src/cli.mjs'])).toMatchObject({
      ui: false, integration: true,
    })
  })

  // P8-03: shared source trees are imported by both Electron/infra and renderer
  // code, so their changes must reach the DB-backed and UI partitions.
  it('runs both partitions for shared-core source changes', () => {
    for (const file of [
      'src/core/generation-v2/providers/anthropic/chatStreamV1.ts',
      'src/shared/serialization/canonicalJsonV2.ts',
      'config/appCsp.ts',
      'tests/helpers/dbBridge.ts',
      '.github/workflows/ci.yml',
    ]) {
      expect(resolveTestCiScope([file]), file).toMatchObject({ ui: true, integration: true })
    }
  })

  it('keeps unit-owned shared-tree tests in the unit partition only', () => {
    expect(resolveTestCiScope(['src/core/generation-v2/compiler/stableSerialize.test.ts'])).toMatchObject({
      ui: false, integration: false,
    })
  })

  it('routes scripts tests and sources to integration', () => {
    expect(resolveTestCiScope(['scripts/agent/control.test.mjs'])).toMatchObject({ ui: false, integration: true })
    expect(resolveTestCiScope(['scripts/agent/control.mjs'])).toMatchObject({ ui: false, integration: true })
  })

  it('runs every partition for a full run such as a push to main', () => {
    expect(resolveTestCiScope(['README.md'], { fullRun: true })).toMatchObject({
      ui: true, integration: true, reason: 'full-run',
    })
  })

  it('fails closed when the comparison base is unavailable', () => {
    expect(resolveTestCiScope([], { baseAvailable: false })).toMatchObject({
      ui: true, integration: true, reason: 'base-unavailable',
    })
  })
})
