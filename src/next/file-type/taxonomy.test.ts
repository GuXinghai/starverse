import { describe, expect, it } from 'vitest'
import { FILE_FORMAT_DESCRIPTORS } from './taxonomy'
import { FILE_FORMAT_IDS, FILE_KINDS, type FileFormatId } from './types'

describe('file-type taxonomy descriptors', () => {
  it('provides one descriptor for every FileFormatId', () => {
    for (const formatId of FILE_FORMAT_IDS) {
      expect(FILE_FORMAT_DESCRIPTORS[formatId]).toBeDefined()
    }
  })

  it('keeps descriptor.formatId aligned with descriptor key', () => {
    for (const [key, descriptor] of Object.entries(FILE_FORMAT_DESCRIPTORS)) {
      expect(descriptor.formatId).toBe(key)
    }
  })

  it('uses legal primaryKind and non-empty businessKinds', () => {
    const kindSet = new Set(FILE_KINDS)
    for (const descriptor of Object.values(FILE_FORMAT_DESCRIPTORS)) {
      expect(kindSet.has(descriptor.primaryKind)).toBe(true)
      expect(descriptor.businessKinds.length).toBeGreaterThan(0)
      for (const kind of descriptor.businessKinds) {
        expect(kindSet.has(kind)).toBe(true)
      }
    }
  })

  it('marks macro-capable document formats correctly', () => {
    const macroFormats: FileFormatId[] = ['docm', 'xlsm', 'pptm']
    for (const formatId of macroFormats) {
      expect(FILE_FORMAT_DESCRIPTORS[formatId].macroCapable).toBe(true)
    }
  })

  it('marks executable formats correctly', () => {
    const executableFormats: FileFormatId[] = ['windows_exe', 'msi', 'dll', 'elf', 'mach_o', 'apk', 'dmg', 'script_file']
    for (const formatId of executableFormats) {
      expect(FILE_FORMAT_DESCRIPTORS[formatId].executable).toBe(true)
    }
  })

  it('marks scriptable formats correctly', () => {
    const scriptableFormats: FileFormatId[] = ['html', 'svg', 'source_code', 'script_file']
    for (const formatId of scriptableFormats) {
      expect(FILE_FORMAT_DESCRIPTORS[formatId].scriptable).toBe(true)
    }
  })

  it('marks container-based formats correctly', () => {
    const containerFormats: FileFormatId[] = [
      'docx',
      'docm',
      'odt',
      'epub',
      'xlsx',
      'xlsm',
      'ods',
      'pptx',
      'pptm',
      'odp',
      'zip',
      'rar',
      'seven_zip',
      'tar',
      'gzip',
      'msi',
      'apk',
      'dmg',
      'ooxml_container',
      'odf_container',
      'generic_container',
    ]
    for (const formatId of containerFormats) {
      expect(FILE_FORMAT_DESCRIPTORS[formatId].containerBased).toBe(true)
    }
  })

  it('does not treat source_code as executable by default', () => {
    expect(FILE_FORMAT_DESCRIPTORS.source_code.executable).toBe(false)
  })
})
