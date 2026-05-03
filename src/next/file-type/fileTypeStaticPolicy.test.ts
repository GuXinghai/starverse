import { describe, expect, it } from 'vitest'
import { evaluateFileTypeStaticPolicy } from './fileTypeStaticPolicy'
import type { FileTypeConflict, FileTypeFlag, FileTypePrimary } from './types'

const noConflicts: FileTypeConflict[] = []
const noFlags: FileTypeFlag[] = []

function primary(formatId: FileTypePrimary['formatId'], kind: FileTypePrimary['kind']): FileTypePrimary {
  return {
    formatId,
    kind,
    confidence: 'high',
    reasonCodes: [],
    sourceCodeMeta: null,
  }
}

describe('fileTypeStaticPolicy', () => {
  it('blocks executable content by static policy without malicious wording assumptions', () => {
    const result = evaluateFileTypeStaticPolicy({
      primary: primary('windows_exe', 'executable'),
      conflicts: noConflicts,
      flags: noFlags,
    })
    expect(result.blocked).toBe(true)
    expect(result.blockingReasonCodes).toContain('reason.executable_content')
    expect(result.defaultSendRoutes).toEqual(['blocked'])
  })

  it('warns for macro-capable and scriptable formats', () => {
    const macro = evaluateFileTypeStaticPolicy({
      primary: primary('docm', 'document'),
      conflicts: noConflicts,
      flags: noFlags,
    })
    const scriptable = evaluateFileTypeStaticPolicy({
      primary: primary('svg', 'image'),
      conflicts: noConflicts,
      flags: noFlags,
    })
    expect(macro.warningReasonCodes).toContain('reason.macro_capable_document')
    expect(scriptable.warningReasonCodes).toContain('reason.scriptable_format')
  })

  it('blocks polyglot_suspected flags', () => {
    const result = evaluateFileTypeStaticPolicy({
      primary: primary('pdf', 'document'),
      conflicts: [
        {
          expectedFormatId: 'pdf',
          observedFormatId: 'windows_exe',
          sources: ['magic'],
          reasonCodes: ['reason.magic_matched'],
          severity: 'high',
        },
      ],
      flags: [
        {
          flag: 'polyglot_suspected',
          reasonCode: 'reason.polyglot_suspected',
          blocking: true,
        },
      ],
    })
    expect(result.blocked).toBe(true)
    expect(result.blockingReasonCodes).toContain('reason.polyglot_suspected')
  })
})
