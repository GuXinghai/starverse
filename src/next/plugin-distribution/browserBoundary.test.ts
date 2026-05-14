import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = join(process.cwd(), 'src', 'next', 'plugin-distribution')
const browserEntry = join(packageRoot, 'browser.ts')
const forbiddenBuiltins = new Set(['node:crypto', 'node:fs', 'node:path', 'node:https', 'node:child_process'])
const forbiddenBareBuiltins = new Set(['crypto', 'fs', 'path', 'https', 'child_process'])
const forbiddenModules = new Set([
  'atomicInstaller',
  'cryptoVerification',
  'downloadPolicy',
  'installPlan',
  'officialPackageRelease',
  'packageDownloader',
])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

function collectLocalImports(entry: string): string[] {
  const visited = new Set<string>()
  const stack = [entry]
  const imports: string[] = []

  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)

    const source = readFileSync(current, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      imports.push(specifier)
      if (!specifier.startsWith('.')) continue

      const resolvedPath = resolve(dirname(current), `${specifier}.ts`)
      if (resolvedPath.startsWith(packageRoot)) {
        stack.push(resolvedPath)
      }
    }
  }

  return imports
}

describe('plugin-distribution browser boundary', () => {
  it('does not import Node-only PDP modules or builtins', () => {
    const imports = collectLocalImports(browserEntry)
    const offenders = imports.filter((specifier) => {
      const leaf = specifier.split('/').pop() ?? specifier
      return (
        forbiddenBuiltins.has(specifier) ||
        forbiddenBareBuiltins.has(specifier) ||
        forbiddenModules.has(leaf)
      )
    })

    expect(offenders).toEqual([])
  })

  it('keeps the renderer entrypoint on the browser-safe barrel', () => {
    const panelPath = join(process.cwd(), 'src', 'ui-app', 'components', 'PluginManagementPanel.vue')
    const panel = readFileSync(panelPath, 'utf8')
    expect(panel).toContain("@/next/plugin-distribution/browser")
    expect(panel).not.toContain("from '@/next/plugin-distribution'")
  })
})
