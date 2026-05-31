import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertOpenRouterTestModel,
  DEFAULT_OPENROUTER_TEST_MODEL,
  OPENROUTER_TEST_MODELS,
  isOpenRouterTestModel,
} from './openRouterTestModels'

const TEST_ROOT = path.join(process.cwd(), 'src')
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/
const GUARDRAIL_FILE = path.resolve(TEST_ROOT, 'next/openrouter/openRouterTestModels.test.ts')
const NEGATIVE_CONTEXT_PATTERN = /Intentionally not from OPENROUTER_TEST_MODELS|validates rejection of non-test model/
const OPENROUTER_LITERAL_PATTERN = /["'`]openrouter\/(?:auto|[^"'`]+)["'`]/
const OPENROUTER_AUTO_SENTINEL_CONTEXTS = new Map<string, RegExp[]>([
  ['next/state/reducer.test.ts', [/"model": "openrouter\/auto",/]],
  ['ui-app/AppChatApp.modelSelectionRegression.test.ts', [/not\.toContain\('openrouter\/auto'\)/]],
  ['ui-app/app/chatSessionConfig.test.ts', [/defaultModelKey: 'openrouter\/auto',/]],
])

function collectTestFiles(rootDir: string): string[] {
  const result: string[] = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const currentDir = stack.pop()
    if (!currentDir) continue

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (TEST_FILE_PATTERN.test(entry.name)) {
        result.push(fullPath)
      }
    }
  }

  return result
}

function isAllowedContext(lines: string[], lineIndex: number): boolean {
  const windowStart = Math.max(0, lineIndex - 1)
  const windowEnd = Math.min(lines.length - 1, lineIndex + 1)
  for (let index = windowStart; index <= windowEnd; index += 1) {
    if (NEGATIVE_CONTEXT_PATTERN.test(lines[index] ?? '')) return true
  }
  return false
}

function isAllowedOpenRouterAutoSentinel(filePath: string, line: string): boolean {
  if (!line.includes('openrouter/auto')) return false
  const relativePath = path.relative(TEST_ROOT, filePath).split(path.sep).join('/')
  const allowedPatterns = OPENROUTER_AUTO_SENTINEL_CONTEXTS.get(relativePath)
  return allowedPatterns?.some((pattern) => pattern.test(line)) ?? false
}

describe('openRouterTestModels', () => {
  it('exposes a stable prioritized test model list', () => {
    expect(OPENROUTER_TEST_MODELS).toHaveLength(3)
    expect(DEFAULT_OPENROUTER_TEST_MODEL).toBe(OPENROUTER_TEST_MODELS[0])
    for (const model of OPENROUTER_TEST_MODELS) {
      expect(isOpenRouterTestModel(model)).toBe(true)
      expect(() => assertOpenRouterTestModel(model)).not.toThrow()
    }
    expect(isOpenRouterTestModel('openrouter/auto')).toBe(false)
    expect(() => assertOpenRouterTestModel('openrouter/auto')).toThrow(
      'OpenRouter test model must be declared in OPENROUTER_TEST_MODELS: openrouter/auto',
    )
  })

  it('does not hardcode openrouter models in test files outside the shared list', () => {
    const violations: string[] = []

    for (const filePath of collectTestFiles(TEST_ROOT)) {
      if (path.resolve(filePath) === GUARDRAIL_FILE) continue

      const fileText = fs.readFileSync(filePath, 'utf8')
      const lines = fileText.split(/\r?\n/)

      lines.forEach((line, index) => {
        if (!OPENROUTER_LITERAL_PATTERN.test(line)) return
        if (line.includes('OPENROUTER_TEST_MODELS')) return
        const trimmedLine = line.trim()
        if (/^(import|export)\s/.test(trimmedLine)) return
        if (trimmedLine.includes('path.join(') || trimmedLine.includes('path.resolve(')) return
        if (isAllowedContext(lines, index)) return
        if (isAllowedOpenRouterAutoSentinel(filePath, line)) return

        violations.push(`${path.relative(TEST_ROOT, filePath)}:${index + 1}: ${line.trim()}`)
      })
    }

    expect(violations).toEqual([])
  })
})
