import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchPackageToFileWithElectronNet } from './electronOfficialPackageDownloadService'
import type { PackageDownloadResumeDescriptor } from '../../src/next/plugin-distribution/packageDownloader'

type FakeRequestRecord = {
  options: any
  headers: Record<string, string>
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createFakeNetRequest(
  handler: (record: FakeRequestRecord, request: EventEmitter) => void
) {
  return ((options: any) => {
    const headers: Record<string, string> = {}
    const request = new EventEmitter() as EventEmitter & {
      setHeader: (name: string, value: string) => void
      end: () => void
      abort: () => void
    }
    request.setHeader = (name, value) => {
      headers[name] = value
    }
    request.abort = () => {
      setImmediate(() => request.emit('error', new Error('download_cancelled')))
    }
    request.end = () => handler({ options, headers }, request)
    return request
  }) as any
}

function sendResponse(
  request: EventEmitter,
  input: Readonly<{
    statusCode: number
    headers?: Record<string, string>
    url: string
    body: string
  }>
): void {
  const response = Readable.from([Buffer.from(input.body)]) as Readable & {
    statusCode?: number
    headers?: Record<string, string>
    url?: string
  }
  response.statusCode = input.statusCode
  response.headers = input.headers ?? {}
  response.url = input.url
  setImmediate(() => request.emit('response', response))
}

function resumeDescriptor(expectedSizeBytes: number, expectedSha256: string): PackageDownloadResumeDescriptor {
  return {
    pluginId: 'dfc-libreoffice',
    runtimeId: 'libreoffice',
    packageId: 'runtime-win32-x64',
    releaseTag: 'v1',
    assetName: 'runtime.svpkg',
    sourceKind: 'github_release_asset',
    expectedSizeBytes,
    expectedSha256,
    tempArtifactId: 'tmp-runtime',
    rangeSupportMode: 'redirected_asset_host',
  }
}

async function writeResumeMetadata(metadataPath: string, descriptor: PackageDownloadResumeDescriptor, currentBytesWritten: number): Promise<void> {
  await writeFile(metadataPath, `${JSON.stringify({
    ...descriptor,
    currentBytesWritten,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    retryCount: 0,
    terminalDiagnostic: null,
  }, null, 2)}\n`)
}

describe('electron official package download service', () => {
  it('streams an Electron net response to a file with hash, size, progress, and finalRef', async () => {
    const tempRoot = path.join(os.tmpdir(), `starverse-electron-download-${Date.now()}`)
    const outputPath = path.join(tempRoot, 'runtime.svpkg')
    const progress: unknown[] = []
    const fakeRequest = createFakeNetRequest((_record, request) => {
      sendResponse(request, {
        statusCode: 200,
        headers: { 'content-length': '11' },
        url: 'https://release-assets.githubusercontent.com/runtime.svpkg',
        body: 'hello world',
      })
    })
    try {
      await mkdir(tempRoot, { recursive: true })

      const result = await fetchPackageToFileWithElectronNet({
        transportRef: 'https://github.com/GuXinghai/starverse/releases/download/v1/runtime.svpkg',
        maxBytes: 1024,
        outputPath,
        onProgress: (value) => progress.push(value),
      }, { request: fakeRequest })

      expect(result).toEqual({
        ok: true,
        filePath: outputPath,
        sizeBytes: 11,
        sha256: sha256('hello world'),
        finalRef: 'https://release-assets.githubusercontent.com/runtime.svpkg',
      })
      expect(await readFile(outputPath, 'utf8')).toBe('hello world')
      expect(progress).toContainEqual({ bytesReceived: 11, totalBytes: 11 })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('resumes a partial download with a Range request and content-range validation', async () => {
    const tempRoot = path.join(os.tmpdir(), `starverse-electron-download-resume-${Date.now()}`)
    const outputPath = path.join(tempRoot, 'runtime.svpkg')
    const partialPath = `${outputPath}.partial`
    const metadataPath = `${outputPath}.partial.json`
    const descriptor = resumeDescriptor(6, sha256('abcdef'))
    let seenRange = ''
    const fakeRequest = createFakeNetRequest((record, request) => {
      seenRange = record.headers.Range
      sendResponse(request, {
        statusCode: 206,
        headers: {
          'content-length': '3',
          'content-range': 'bytes 3-5/6',
        },
        url: 'https://release-assets.githubusercontent.com/runtime.svpkg',
        body: 'def',
      })
    })
    try {
      await mkdir(tempRoot, { recursive: true })
      await writeFile(partialPath, 'abc')
      await writeResumeMetadata(metadataPath, descriptor, 3)

      const result = await fetchPackageToFileWithElectronNet({
        transportRef: 'https://github.com/GuXinghai/starverse/releases/download/v1/runtime.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: {
          enabled: true,
          descriptor,
          maxRetries: 0,
          retryDelayMs: 0,
        },
      }, { request: fakeRequest })

      expect(seenRange).toBe('bytes=3-')
      expect(result).toMatchObject({
        ok: true,
        filePath: outputPath,
        sizeBytes: 6,
        sha256: sha256('abcdef'),
      })
      expect(await readFile(outputPath, 'utf8')).toBe('abcdef')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
