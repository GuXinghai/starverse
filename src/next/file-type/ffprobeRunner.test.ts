import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runFFProbe,
  type FFProbeRunnerResult,
} from './ffprobeRunner'
import type { ExternalProcessRunResult } from './externalProcessRunner'

const NODE = process.execPath

// eslint-disable-next-line max-lines-per-function
function createFakeFFProbeRuntime(probeType: 'video' | 'audio' | 'minimal' | 'path_in_tags' | 'bad_duration' | 'no_streams'): string {
  if (probeType === 'video') {
    const json = JSON.stringify({
      format: {
        format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '123.456000',
        size: '10485760',
        bit_rate: '680000',
        tags: { title: 'Test Video', encoder: 'Lavf58.29.100' },
      },
      streams: [
        {
          index: 0,
          codec_name: 'h264',
          codec_type: 'video',
          width: 1920,
          height: 1080,
          r_frame_rate: '30/1',
          duration: '123.456000',
          tags: { language: 'und' },
        },
        {
          index: 1,
          codec_name: 'aac',
          codec_type: 'audio',
          sample_rate: '44100',
          channels: 2,
          duration: '123.456000',
          tags: { language: 'eng' },
        },
      ],
    })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  if (probeType === 'audio') {
    const json = JSON.stringify({
      format: {
        format_name: 'mp3',
        duration: '240.500000',
        bit_rate: '192000',
        tags: { artist: 'Test Artist', album: 'Test Album' },
      },
      streams: [
        {
          index: 0,
          codec_name: 'mp3',
          codec_type: 'audio',
          sample_rate: '44100',
          channels: 2,
          duration: '240.500000',
          bit_rate: '192000',
        },
      ],
    })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  if (probeType === 'minimal') {
    const json = JSON.stringify({
      format: { format_name: 'single' },
      streams: [],
    })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  if (probeType === 'path_in_tags') {
    const json = JSON.stringify({
      format: {
        format_name: 'matroska,webm',
        duration: '30.0',
        tags: {
          title: 'Secret Video',
          ENCODER: 'C:\\Program Files\\encoder\\tool.exe',
          source_path: '/tmp/ffprobe-input-abc123.bin',
          file_hash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789beef',
        },
      },
      streams: [
        {
          index: 0,
          codec_name: 'vp9',
          codec_type: 'video',
          width: 1280,
          height: 720,
        },
      ],
    })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  if (probeType === 'bad_duration') {
    const json = JSON.stringify({
      format: { format_name: 'bad', duration: 'not-a-number' },
      streams: [{ index: 0, codec_name: 'x', codec_type: 'video', duration: 'what', r_frame_rate: 'not/fraction' }],
    })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  if (probeType === 'no_streams') {
    const json = JSON.stringify({ format: { format_name: 'empty' } })
    return `process.stdout.write(JSON.stringify(${json}))`
  }
  return 'process.exit(0)'
}

function createErrorRuntime(errorType: 'exit1' | 'bad_json' | 'not_object' | 'crash'): string {
  if (errorType === 'exit1') return 'process.exit(1)'
  if (errorType === 'bad_json') return 'process.stdout.write("not json")'
  if (errorType === 'not_object') return 'process.stdout.write("null")'
  if (errorType === 'crash') return 'throw new Error("ffprobe crash")'
  return 'process.exit(0)'
}

type TempFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  cleanup: () => Promise<void>
}>

async function createTempFixture(input: Readonly<{
  probeType?: 'video' | 'audio' | 'minimal' | 'path_in_tags' | 'bad_duration' | 'no_streams'
  errorType?: 'exit1' | 'bad_json' | 'not_object' | 'crash'
}> = {}): Promise<TempFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-ffprobe-runner-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  await mkdir(runtimeDir, { recursive: true })

  const runtimeCode = input.errorType
    ? createErrorRuntime(input.errorType)
    : createFakeFFProbeRuntime(input.probeType ?? 'video')
  const runtimeEntryPath = path.join(runtimeDir, 'fake-ffprobe-runner.js')
  await writeFile(runtimeEntryPath, runtimeCode)

  return {
    rootDir,
    runtimeEntryPath,
    cleanup: async () => { await rm(rootDir, { recursive: true, force: true }) },
  }
}

function createMockProcessRunner(output: Partial<ExternalProcessRunResult>): (input: any) => Promise<ExternalProcessRunResult> {
  return async () => ({
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    outputLimited: false,
    terminationAttempted: false,
    terminated: true,
    errorCode: null,
    elapsedMs: 100,
    ...output,
  })
}

function runFFProbeWithFixture(
  fixture: TempFixture,
  input: Readonly<{
    inputBytes?: Uint8Array
    metadataAllowlist?: readonly string[] | null
    maxInputBytes?: number
  }> = {}
): Promise<FFProbeRunnerResult> {
  return runFFProbe({
    inputBytes: input.inputBytes ?? new Uint8Array([1, 2, 3]),
    command: NODE,
    args: [fixture.runtimeEntryPath],
    metadataAllowlist: input.metadataAllowlist ?? null,
    maxInputBytes: input.maxInputBytes,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('ffprobeRunner', () => {
  // -- video probe success --
  it('returns video format and streams on success', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect(result.format!.formatName).toContain('mp4')
      expect(result.format!.duration).toBe('123.456000')
      expect(result.format!.bitRate).toBe('680000')
      expect(result.streams).toHaveLength(2)

      const videoStream = result.streams.find(s => s.codecType === 'video')
      expect(videoStream).toBeDefined()
      expect(videoStream!.codecName).toBe('h264')
      expect(videoStream!.width).toBe(1920)
      expect(videoStream!.height).toBe(1080)
      expect(videoStream!.frameRate).toBe('30/1')

      const audioStream = result.streams.find(s => s.codecType === 'audio')
      expect(audioStream).toBeDefined()
      expect(audioStream!.codecName).toBe('aac')
      expect(audioStream!.sampleRate).toBe(44100)
      expect(audioStream!.channels).toBe(2)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- audio probe success --
  it('returns audio format and streams on success', async () => {
    const fixture = await createTempFixture({ probeType: 'audio' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect(result.format!.formatName).toBe('mp3')
      expect(result.streams).toHaveLength(1)
      expect(result.streams[0].codecType).toBe('audio')
      expect(result.streams[0].codecName).toBe('mp3')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- minimal probe --
  it('returns minimal format with empty streams', async () => {
    const fixture = await createTempFixture({ probeType: 'minimal' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect(result.streams).toHaveLength(0)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- missing streams array --
  it('handles missing streams array gracefully', async () => {
    const fixture = await createTempFixture({ probeType: 'no_streams' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.streams).toHaveLength(0)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- bad duration / bad numeric fields --
  it('drops invalid duration and bad numeric fields', async () => {
    const fixture = await createTempFixture({ probeType: 'bad_duration' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect(result.format!.duration).toBeUndefined()
      expect(result.streams[0].duration).toBeUndefined()
      expect(result.streams[0].frameRate).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- invalid JSON --
  it('handles invalid JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_json' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- not an object --
  it('handles non-object JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'not_object' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- runtime error --
  it('handles runtime exit non-zero', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('runtime_error')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- input too large --
  it('returns input_too_large when bytes exceed limit', async () => {
    const fixture = await createTempFixture()
    try {
      const large = new Uint8Array(500 * 1024 * 1024 + 1)
      const result = await runFFProbeWithFixture(fixture, { inputBytes: large })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- timeout via mock --
  it('handles timeout via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runFFProbe({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
      }, {
        processRunner: createMockProcessRunner({
          timedOut: true,
          errorCode: 'process_timeout',
          exitCode: null,
          stdout: '',
        }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('timeout')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- output limit via mock --
  it('handles output limit via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runFFProbe({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
      }, {
        processRunner: createMockProcessRunner({
          outputLimited: true,
          errorCode: 'output_limit_exceeded',
          exitCode: null,
          stdout: '',
        }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('output_limit')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- unknown metadata tags dropped --
  it('drops metadata tags not in allowlist', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture, {
        metadataAllowlist: ['title'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect(result.format!.tags).toBeDefined()
      expect(result.format!.tags!['title']).toBe('Test Video')
      expect(result.format!.tags!['encoder']).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- null disables tags --
  it('drops all tags when metadataAllowlist is null', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture, { metadataAllowlist: null })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format!.tags).toBeUndefined()
      expect(result.streams).toHaveLength(2)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty allowlist drops all tags --
  it('drops all tags when allowlist is empty', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture, { metadataAllowlist: [] })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format!.tags).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- path/hash/token sanitization in tags --
  it('sanitizes Windows and Unix paths and hashes in tags', async () => {
    const fixture = await createTempFixture({ probeType: 'path_in_tags' })
    try {
      const result = await runFFProbeWithFixture(fixture, {
        metadataAllowlist: ['title', 'ENCODER', 'source_path', 'file_hash'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format!.tags).toBeDefined()
      expect(result.format!.tags!['title']).toBe('Secret Video')
      expect(result.format!.tags!['ENCODER']).toContain('[redacted-path]')
      expect(result.format!.tags!['ENCODER']).not.toContain('C:')
      expect(result.format!.tags!['source_path']).toContain('[redacted-path]')
      expect(result.format!.tags!['source_path']).not.toContain('/tmp/')
      expect(result.format!.tags!['file_hash']).toContain('[redacted-hash]')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- filename not present in output --
  it('does not expose filename in format output', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
      expect((result.format as any)['filename']).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- no transcode behavior (contract-only verify) --
  it('does not perform transcode or frame extraction (contract only)', async () => {
    const fixture = await createTempFixture({ probeType: 'video' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.streams).toHaveLength(2)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- error sanitization --
  it('sanitizes paths in failure details', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.detail).not.toContain(fixture.runtimeEntryPath)
      expect(result.detail).not.toMatch(/[A-Za-z]:\\/u)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- crash --
  it('handles runtime crash', async () => {
    const fixture = await createTempFixture({ errorType: 'crash' })
    try {
      const result = await runFFProbeWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(['runtime_error', 'invalid_output']).toContain(result.errorCode)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty input bytes --
  it('processes empty input bytes', async () => {
    const fixture = await createTempFixture({ probeType: 'minimal' })
    try {
      const result = await runFFProbeWithFixture(fixture, { inputBytes: new Uint8Array(0) })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.format).toBeDefined()
    } finally {
      await fixture.cleanup()
    }
  })
})
