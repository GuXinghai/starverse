import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(process.cwd())
const rendererRoots = [
  join(repoRoot, 'src', 'ui-app'),
  join(repoRoot, 'src', 'ui-kit', 'chat'),
  join(repoRoot, 'src', 'next', 'files'),
]
const explicitFiles = [
  join(repoRoot, 'src', 'ui-app', 'app', 'appChatApp.logic.ts'),
  join(repoRoot, 'src', 'next', 'openrouter', 'openRouterSendPreparation.ts'),
]
const forbiddenImportPattern = /(?:import|export)\s+[^\n]*from\s+['"][^'"]*(?:node:|(?:\.\.\/)*infra\/|@\/infra\/|openRouterSendPlanSerializer|localStorageResolver)['"]/m
const skippedFilePattern = /(?:\.test\.|\.spec\.)/i

function collectSourceFiles(root: string): string[] {
  const files: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!/\.(ts|tsx|js|jsx|vue)$/i.test(entry)) continue
      if (skippedFilePattern.test(entry)) continue
      files.push(fullPath)
    }
  }

  return files
}

describe('renderer import boundary', () => {
  it('keeps renderer and client files free of Node-only imports', () => {
    const files = new Set<string>()
    for (const root of rendererRoots) {
      for (const file of collectSourceFiles(root)) {
        files.add(file)
      }
    }
    for (const file of explicitFiles) {
      files.add(file)
    }

    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (forbiddenImportPattern.test(content)) {
        offenders.push(relative(repoRoot, file).replaceAll('\\', '/'))
      }
    }

    expect(offenders).toEqual([])
  })
})
