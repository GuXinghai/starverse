import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GenerationOperationBindingV2 } from './generationOperationBindingV2'

const FORBIDDEN_OPERATION_NAMES = Object.freeze([
  'resultAnswerRootId',
  'targetAnswerRootId',
  'result_answer_root_id',
  'target_answer_root_id',
])

function productionFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue
      files.push(...productionFiles(absolute))
    } else if (/\.(?:sql|ts|vue)$/u.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(absolute)
    }
  }
  return files
}

describe('GenerationOperationBindingV2', () => {
  it('uses one exact operation identity vocabulary', () => {
    const binding: GenerationOperationBindingV2 = {
      operationId: 'operation:1',
      conversationId: 'conversation:1',
      branchId: 'branch:1',
      targetAnswerId: 'answer:target',
      sourceAnswerId: 'answer:source',
      snapshotHash: 'a'.repeat(64),
      providerId: 'deepseek',
      contractId: 'deepseek-chat-completions-v1',
    }
    expect(Object.keys(binding).sort()).toEqual([
      'branchId',
      'contractId',
      'conversationId',
      'operationId',
      'providerId',
      'snapshotHash',
      'sourceAnswerId',
      'targetAnswerId',
    ])
  })

  it('does not retain deprecated operation field names in production code or SQL', () => {
    const roots = [
      path.resolve('infra', 'db'),
      path.resolve('electron', 'ipc'),
      path.resolve('electron', 'services'),
      path.resolve('src', 'next', 'generation-v2'),
      path.resolve('src', 'ui-app'),
    ]
    const violations: string[] = []
    for (const file of roots.flatMap(productionFiles)) {
      const source = fs.readFileSync(file, 'utf8')
      for (const forbidden of FORBIDDEN_OPERATION_NAMES) {
        if (source.includes(forbidden)) {
          violations.push(`${path.relative(process.cwd(), file)}:${forbidden}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('routes every provider runtime through the shared operation starter', () => {
    const runtimeFiles = [
      'anthropicGenerationV2Runtime.ts',
      'deepSeekGenerationV2Runtime.ts',
      'geminiGenerateContentGenerationV2Runtime.ts',
      'geminiInteractionsImageGenerationV2Runtime.ts',
      'genericLocalOpenAIChatGenerationV2Runtime.ts',
      'lmStudioOpenResponsesGenerationV2Runtime.ts',
      'ollamaChatGenerationV2Runtime.ts',
      'openAIChatCompatibleGenerationV2Runtime.ts',
      'openAIResponsesGenerationV2Runtime.ts',
      'openRouterChatGenerationV2Runtime.ts',
      'openRouterImageGenerationV2Runtime.ts',
    ]
    const violations = runtimeFiles.flatMap((name) => {
      const source = fs.readFileSync(path.resolve('electron', 'services', name), 'utf8')
      return [
        ...(!source.includes('GenerationRuntimeStarterV2') ? [`${name}:missing-shared-starter`] : []),
        ...(source.includes('new Map<string, AbortController>') ? [`${name}:private-controller`] : []),
        ...(source.includes('.catch(() => undefined)') ? [`${name}:silent-runner-failure`] : []),
      ]
    })
    expect(violations).toEqual([])

    const ipcSources = productionFiles(path.resolve('electron', 'ipc'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')
    expect(ipcSources).not.toContain('attachAbort')
  })
})
