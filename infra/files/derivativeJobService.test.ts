import { afterEach, describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileDerivativeRepo } from '../db/repo/fileDerivativeRepo'
import { DerivativeJobRepo } from '../db/repo/derivativeJobRepo'
import { ModelCatalogRepo } from '../db/repo/modelCatalogRepo'
import { MessageRepo } from '../db/repo/messageRepo'
import { DerivativeJobService } from './derivativeJobService'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('DerivativeJobService') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

describeIfBetterSqlite('DerivativeJobService', () => {
  let rootDir = ''

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true })
      rootDir = ''
    }
  })

  async function createHarness() {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-derivatives-'))
    const fileAssetRepo = new FileAssetRepo(db)
    const fileDerivativeRepo = new FileDerivativeRepo(db)
    const derivativeJobRepo = new DerivativeJobRepo(db)
    const modelCatalogRepo = new ModelCatalogRepo(db)
    const service = new DerivativeJobService({
      db,
      fileAssetRepo,
      fileDerivativeRepo,
      derivativeJobRepo,
      modelCatalogRepo,
      storageRootDir: rootDir,
      now: () => 100,
    })
    return { db, fileAssetRepo, fileDerivativeRepo, derivativeJobRepo, modelCatalogRepo, service }
  }

  async function writeAssetFile(root: string, storageUri: string, content: string | Uint8Array) {
    const filePath = path.join(root, ...storageUri.split('/'))
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
    return filePath
  }

  function createPngBytes(width: number, height: number): Uint8Array {
    const png = new PNG({ width, height })
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        png.data[offset] = x % 255
        png.data[offset + 1] = y % 255
        png.data[offset + 2] = 180
        png.data[offset + 3] = 255
      }
    }
    return new Uint8Array(PNG.sync.write(png))
  }

  function createJpegBytes(width: number, height: number): Uint8Array {
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        data[offset] = 200
        data[offset + 1] = x % 255
        data[offset + 2] = y % 255
        data[offset + 3] = 255
      }
    }
    return new Uint8Array(jpeg.encode({ data: Buffer.from(data), width, height }, 92).data)
  }

  function insertAudioModel(db: BetterSqlite3.Database, modelId = 'openrouter/audio-transcribe') {
    db.prepare(`
      INSERT INTO providers(provider_key, display_name, updated_at_ms)
      VALUES ('openrouter', 'OpenRouter', 1)
      ON CONFLICT(provider_key) DO NOTHING
    `).run()
    db.prepare(`
      INSERT INTO models(
        provider_key, model_id, model_key, display_name, status, visibility,
        input_modalities_json, output_modalities_json, supported_parameters_json, capabilities_json,
        cap_reasoning, cap_tools, cap_structured_outputs, cap_vision, cap_long_context,
        unknown_expiration, has_per_request_limits, has_default_parameters, has_tools,
        has_structured_outputs, has_reasoning, has_seed, in_modality_image,
        first_seen_at_ms, last_seen_at_ms, synced_at_ms
      )
      VALUES (
        'openrouter', @modelId, @modelKey, 'Audio Transcript', 'active', 'visible',
        '["text","audio"]', '["text"]', '[]', '{}',
        0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        1, 1, 1
      )
    `).run({ modelId, modelKey: `openrouter::${modelId}` })
    return modelId
  }

  function insertTextOnlyModel(db: BetterSqlite3.Database, modelId = 'openrouter/text-only') {
    db.prepare(`
      INSERT INTO providers(provider_key, display_name, updated_at_ms)
      VALUES ('openrouter', 'OpenRouter', 1)
      ON CONFLICT(provider_key) DO NOTHING
    `).run()
    db.prepare(`
      INSERT INTO models(
        provider_key, model_id, model_key, display_name, status, visibility,
        input_modalities_json, output_modalities_json, supported_parameters_json, capabilities_json,
        cap_reasoning, cap_tools, cap_structured_outputs, cap_vision, cap_long_context,
        unknown_expiration, has_per_request_limits, has_default_parameters, has_tools,
        has_structured_outputs, has_reasoning, has_seed, in_modality_image,
        first_seen_at_ms, last_seen_at_ms, synced_at_ms
      )
      VALUES (
        'openrouter', @modelId, @modelKey, 'Text Only', 'active', 'visible',
        '["text"]', '["text"]', '[]', '{}',
        0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        1, 1, 1
      )
    `).run({ modelId, modelKey: `openrouter::${modelId}` })
    return modelId
  }

  it('runs txt extracted_text jobs and writes a derivative file without touching the original asset', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const asset = fileAssetRepo.create({
      id: 'asset-txt',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 12,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-txt.txt',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, 'hello world')
    const job = service.createDerivativeJob({
      id: 'job-txt',
      assetId: asset.id,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'phase-7-test',
    })

    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job).toMatchObject({ status: 'ready', outputDerivativeId: 'job-txt' })
    expect(result.derivative).toMatchObject({
      id: 'job-txt',
      parentAssetId: asset.id,
      derivedKind: 'extracted_text',
      status: 'ready',
    })
    const derivativePath = path.join(rootDir, ...String(result.derivative?.storageUri).split('/'))
    expect(await readFile(derivativePath, 'utf8')).toBe('hello world')
    expect(fileAssetRepo.getById(asset.id)?.storageUri).toBe('assets/original/as/asset-txt.txt')
  })

  it('converts html assets into safe markdown text without executing scripts or loading externals', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const html = `<html><head><style>.x{color:red}</style><script>window.alert('x')</script></head><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>`
    const asset = fileAssetRepo.create({
      id: 'asset-html',
      filename: 'index.html',
      extension: 'html',
      mime: 'text/html',
      sizeBytes: Buffer.byteLength(html, 'utf8'),
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-html.html',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, html)
    const job = service.createDerivativeJob({
      id: 'job-html',
      assetId: asset.id,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'phase-9-test',
    })

    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job).toMatchObject({ status: 'ready' })
    expect(result.derivative?.metaJson).toMatchObject({
      targetKind: 'markdown',
      usage: 'preview_and_send',
      conversionWarnings: expect.arrayContaining([
        'html_javascript_not_executed',
        'html_external_resources_not_loaded',
      ]),
    })
    const derivativePath = path.join(rootDir, ...String(result.derivative?.storageUri).split('/'))
    const rendered = await readFile(derivativePath, 'utf8')
    expect(rendered).toContain('# Title')
    expect(rendered).toContain('Hello world')
    expect(rendered).not.toContain('window.alert')
    expect(rendered).not.toContain('.x{color:red}')
  })

  it('converts postscript-like assets to code target and preserves source text', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const ps = `%!PS-Adobe-3.0\n/Times-Roman findfont 12 scalefont setfont\n72 720 moveto\n(Hello PS) show\nshowpage\n`
    const asset = fileAssetRepo.create({
      id: 'asset-ps',
      filename: 'diagram.eps',
      extension: 'eps',
      mime: 'application/postscript',
      sizeBytes: Buffer.byteLength(ps, 'utf8'),
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-ps.eps',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, ps)
    const job = service.createDerivativeJob({
      id: 'job-ps',
      assetId: asset.id,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'phase-9-test',
    })

    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job).toMatchObject({ status: 'ready' })
    expect(result.derivative?.metaJson).toMatchObject({
      targetKind: 'code',
      usage: 'preview_and_send',
    })
    const derivativePath = path.join(rootDir, ...String(result.derivative?.storageUri).split('/'))
    expect(await readFile(derivativePath, 'utf8')).toContain('(Hello PS) show')
  })

  it('captures PDF annotation text into extracted_text derivatives and stores annotation hash metadata', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const pdf = fileAssetRepo.create({
      id: 'asset-pdf',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 32,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-pdf.pdf',
      ingestStatus: 'stored',
    })
    const convoId = 'c1'
    db.prepare(`
      INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
      VALUES (@id, NULL, 'PDF', 1, 1, NULL)
    `).run({ id: convoId })
    const message = new MessageRepo(db).append({ convoId, role: 'assistant', body: 'done' })
    db.prepare('UPDATE message SET annotations_json = @annotations WHERE id = @id').run({
      id: message.id,
      annotations: JSON.stringify([
        {
          type: 'file_annotation',
          file: {
            hash: 'hash-1',
            name: 'report.pdf',
            content: [
              { type: 'text', text: 'Page one text.' },
              { type: 'text', text: 'Page two text.' },
            ],
          },
        },
      ]),
    })

    const captured = await service.capturePdfAnnotations({
      messageId: message.id,
      assetIds: [pdf.id],
    })
    expect(captured.captured).toHaveLength(1)
    expect(captured.failed).toHaveLength(0)
    expect(captured.captured[0]?.derivative?.metaJson).toMatchObject({
      source: 'pdf_annotation',
      annotationHash: 'hash-1',
    })
    const derivativePath = path.join(rootDir, ...String(captured.captured[0]?.derivative?.storageUri).split('/'))
    expect(await readFile(derivativePath, 'utf8')).toContain('Page one text.')
  })

  it('returns pdf_annotation_missing when annotations are absent or image-only without text parts', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const pdf = fileAssetRepo.create({
      id: 'asset-pdf-missing',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 32,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-pdf-missing.pdf',
      ingestStatus: 'stored',
    })
    const convoId = 'c-missing'
    db.prepare(`
      INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
      VALUES (@id, NULL, 'PDF Missing', 1, 1, NULL)
    `).run({ id: convoId })
    const message = new MessageRepo(db).append({ convoId, role: 'assistant', body: 'done' })

    const missing = await service.capturePdfAnnotations({
      messageId: message.id,
      assetIds: [pdf.id],
    })
    expect(missing.captured).toHaveLength(0)
    expect(missing.failed).toMatchObject([{ assetId: pdf.id, errorCode: 'pdf_annotation_missing' }])

    db.prepare('UPDATE message SET annotations_json = @annotations WHERE id = @id').run({
      id: message.id,
      annotations: JSON.stringify([
        {
          type: 'file_annotation',
          file: {
            hash: null,
            name: 'report.pdf',
            content: [{ type: 'image_url', image_url: { url: 'https://example.com/page.png' } }],
          },
        },
      ]),
    })
    const imageOnly = await service.capturePdfAnnotations({
      messageId: message.id,
      assetIds: [pdf.id],
    })
    expect(imageOnly.captured).toHaveLength(0)
    expect(imageOnly.failed).toMatchObject([{ assetId: pdf.id, errorCode: 'pdf_annotation_missing' }])
  })

  it('marks parse-failed PDF annotation capture jobs as failed with pdf_annotation_parse_failed', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const pdf = fileAssetRepo.create({
      id: 'asset-pdf-malformed',
      filename: 'broken.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 32,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-pdf-malformed.pdf',
      ingestStatus: 'stored',
    })
    const convoId = 'c-malformed'
    db.prepare(`
      INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
      VALUES (@id, NULL, 'PDF Malformed', 1, 1, NULL)
    `).run({ id: convoId })
    const message = new MessageRepo(db).append({ convoId, role: 'assistant', body: 'done' })
    db.prepare('UPDATE message SET annotations_json = @annotations WHERE id = @id').run({
      id: message.id,
      annotations: JSON.stringify([
        {
          type: 'file_annotation',
          file: {
            hash: null,
            name: 'broken.pdf',
            content: { type: 'text', text: 'not-an-array' },
          },
        },
      ]),
    })

    const captured = await service.capturePdfAnnotations({
      messageId: message.id,
      assetIds: [pdf.id],
    })
    expect(captured.captured).toHaveLength(0)
    expect(captured.failed).toMatchObject([{ assetId: pdf.id, errorCode: 'pdf_annotation_parse_failed' }])
    const jobs = service.listDerivativeJobsByAssetId(pdf.id)
    expect(jobs[0]).toMatchObject({
      derivativeKind: 'extracted_text',
      status: 'failed',
      errorCode: 'pdf_annotation_parse_failed',
    })
  })

  it('fails transcript jobs for remote-url audio assets and succeeds with local audio plus audio-capable model', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const remoteAudio = fileAssetRepo.create({
      id: 'asset-audio-remote',
      filename: 'remote.mp3',
      extension: 'mp3',
      mime: 'audio/mpeg',
      sizeBytes: 10,
      assetKind: 'audio',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://example.com/audio.mp3',
      ingestStatus: 'registered',
      sourceMetaJson: { originalUrl: 'https://example.com/audio.mp3' },
    })
    const remoteJob = service.createDerivativeJob({
      id: 'job-audio-remote',
      assetId: remoteAudio.id,
      derivativeKind: 'transcript',
      taskFamily: 'transcription',
      generator: 'phase-7-test',
      modelId: 'openrouter/audio-transcribe',
      configJson: { modelId: 'openrouter/audio-transcribe' },
    })
    const failed = await service.runDerivativeJob({ jobId: remoteJob.id, apiKey: 'key' })
    expect(failed.job).toMatchObject({ status: 'failed', errorCode: 'audio_url_not_supported_for_transcript' })

    const modelId = insertAudioModel(db)
    const localAudio = fileAssetRepo.create({
      id: 'asset-audio-local',
      filename: 'local.wav',
      extension: 'wav',
      mime: 'audio/wav',
      sizeBytes: 8,
      assetKind: 'audio',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-audio-local.wav',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, localAudio.storageUri, new Uint8Array([0, 1, 2, 3]))
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body.messages?.[0]?.content?.[1]?.type).toBe('input_audio')
      expect(typeof body.messages?.[0]?.content?.[1]?.input_audio?.data).toBe('string')
      return new Response(JSON.stringify({
        id: 'resp-transcript',
        choices: [{ message: { content: 'hello transcript' } }],
        usage: { total_tokens: 11 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const localJob = service.createDerivativeJob({
      id: 'job-audio-local',
      assetId: localAudio.id,
      derivativeKind: 'transcript',
      taskFamily: 'transcription',
      generator: 'phase-7-test',
      modelId,
      configJson: { modelId, language: 'en' },
    })
    const transcript = await service.runDerivativeJob({ jobId: localJob.id, apiKey: 'key' })
    expect(transcript.job.status).toBe('ready')
    expect(transcript.derivative?.derivedKind).toBe('transcript')
    const derivativePath = path.join(rootDir, ...String(transcript.derivative?.storageUri).split('/'))
    expect(await readFile(derivativePath, 'utf8')).toBe('hello transcript')
  })

  it('fails transcript jobs with transcript_model_missing and transcript_model_not_audio_capable before request dispatch', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const localAudio = fileAssetRepo.create({
      id: 'asset-audio-model-check',
      filename: 'local.wav',
      extension: 'wav',
      mime: 'audio/wav',
      sizeBytes: 8,
      assetKind: 'audio',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-audio-model-check.wav',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, localAudio.storageUri, new Uint8Array([0, 1, 2, 3]))
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)

    const missingModelJob = service.createDerivativeJob({
      id: 'job-audio-model-missing',
      assetId: localAudio.id,
      derivativeKind: 'transcript',
      taskFamily: 'transcription',
      generator: 'phase-7-test',
      modelId: 'openrouter/non-existent-audio-model',
      configJson: { modelId: 'openrouter/non-existent-audio-model' },
    })
    const missing = await service.runDerivativeJob({ jobId: missingModelJob.id, apiKey: 'key' })
    expect(missing.job).toMatchObject({ status: 'failed', errorCode: 'transcript_model_missing' })
    expect(fileAssetRepo.getById(localAudio.id)?.storageUri).toBe('assets/original/as/asset-audio-model-check.wav')

    const textOnlyModelId = insertTextOnlyModel(db)
    const notAudioJob = service.createDerivativeJob({
      id: 'job-audio-model-not-capable',
      assetId: localAudio.id,
      derivativeKind: 'transcript',
      taskFamily: 'transcription',
      generator: 'phase-7-test',
      modelId: textOnlyModelId,
      configJson: { modelId: textOnlyModelId },
    })
    const notAudio = await service.runDerivativeJob({ jobId: notAudioJob.id, apiKey: 'key' })
    expect(notAudio.job).toMatchObject({ status: 'failed', errorCode: 'transcript_model_not_audio_capable' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('marks transcript jobs as derivative_task_timeout when provider request times out and supports retry', async () => {
    const { db, fileAssetRepo, service } = await createHarness()
    const modelId = insertAudioModel(db)
    const localAudio = fileAssetRepo.create({
      id: 'asset-audio-timeout',
      filename: 'timeout.wav',
      extension: 'wav',
      mime: 'audio/wav',
      sizeBytes: 8,
      assetKind: 'audio',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-audio-timeout.wav',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, localAudio.storageUri, new Uint8Array([0, 1, 2, 3]))

    const abortingFetch = vi.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined
      const onAbort = () => {
        const error = new Error('This operation was aborted')
        ;(error as any).name = 'AbortError'
        reject(error)
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    }))
    vi.stubGlobal('fetch', abortingFetch)

    const timeoutJob = service.createDerivativeJob({
      id: 'job-audio-timeout',
      assetId: localAudio.id,
      derivativeKind: 'transcript',
      taskFamily: 'transcription',
      generator: 'phase-7-test',
      modelId,
      configJson: { modelId },
    })
    const timedOut = await service.runDerivativeJob({ jobId: timeoutJob.id, apiKey: 'key', timeoutMs: 5 })
    expect(timedOut.job).toMatchObject({ status: 'failed', errorCode: 'derivative_task_timeout', attemptCount: 1 })
    expect(timedOut.job.finishedAt).not.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-transcript-timeout-retry',
      choices: [{ message: { content: 'retry transcript' } }],
      usage: { total_tokens: 3 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const retried = await service.retryDerivativeJob({ jobId: timeoutJob.id, apiKey: 'key', timeoutMs: 500 })
    expect(retried.job).toMatchObject({ status: 'ready', attemptCount: 2 })
    expect(retried.derivative?.derivedKind).toBe('transcript')
  })

  it('retries failed embedding jobs, chunks long text, and writes embedding_vector derivatives as JSON', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const asset = fileAssetRepo.create({
      id: 'asset-embed',
      filename: 'doc.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 400,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-embed.txt',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, 'alpha '.repeat(100))
    const extractedJob = service.createDerivativeJob({
      id: 'job-extracted',
      assetId: asset.id,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'phase-7-test',
    })
    await service.runDerivativeJob({ jobId: extractedJob.id })

    const embeddingJob = service.createDerivativeJob({
      id: 'job-embedding',
      assetId: asset.id,
      derivativeKind: 'embedding_vector',
      taskFamily: 'embeddings',
      generator: 'phase-7-test',
      modelId: 'openrouter/embed-small',
      configJson: { modelId: 'openrouter/embed-small', maxChunkChars: 120 },
    })

    let fetchCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      fetchCalls += 1
      if (fetchCalls === 1) {
        return new Response('bad gateway', { status: 502, headers: { 'Content-Type': 'text/plain' } })
      }
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(Array.isArray(body.input)).toBe(true)
      expect(body.input.length).toBeGreaterThan(1)
      return new Response(JSON.stringify({
        id: 'resp-embedding',
        model: 'openrouter/embed-small',
        data: body.input.map((_: string, index: number) => ({ index, embedding: [index + 0.1, index + 0.2] })),
        usage: { total_tokens: 22 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const failed = await service.runDerivativeJob({ jobId: embeddingJob.id, apiKey: 'key' })
    expect(failed.job).toMatchObject({ status: 'failed', errorCode: 'embedding_request_failed' })

    const retried = await service.retryDerivativeJob({ jobId: embeddingJob.id, apiKey: 'key' })
    expect(retried.job).toMatchObject({ status: 'ready', attemptCount: 2 })
    expect(retried.derivative?.derivedKind).toBe('embedding_vector')
    expect(retried.derivative?.metaJson).toMatchObject({
      modelId: 'openrouter/embed-small',
      dimension: 2,
      chunkCount: expect.any(Number),
    })
    const derivativePath = path.join(rootDir, ...String(retried.derivative?.storageUri).split('/'))
    const payload = JSON.parse(await readFile(derivativePath, 'utf8'))
    expect(payload.chunks.length).toBeGreaterThan(1)
    expect(JSON.stringify(payload)).toContain('"dimension":2')
  })

  it('fails embedding jobs with embedding_input_empty when source text is blank', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const asset = fileAssetRepo.create({
      id: 'asset-embed-empty',
      filename: 'empty.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 3,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-embed-empty.txt',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, '   ')
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)
    const embeddingJob = service.createDerivativeJob({
      id: 'job-embedding-empty',
      assetId: asset.id,
      derivativeKind: 'embedding_vector',
      taskFamily: 'embeddings',
      generator: 'phase-7-test',
      modelId: 'openrouter/embed-small',
      configJson: { modelId: 'openrouter/embed-small' },
    })

    const failed = await service.runDerivativeJob({ jobId: embeddingJob.id, apiKey: 'key' })
    expect(failed.job).toMatchObject({ status: 'failed', errorCode: 'embedding_input_empty' })
    expect(failed.derivative).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(fileAssetRepo.getById(asset.id)?.storageUri).toBe('assets/original/as/asset-embed-empty.txt')
  })

  it('fails embedding jobs with embedding_response_invalid when response shape is invalid', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const asset = fileAssetRepo.create({
      id: 'asset-embed-invalid',
      filename: 'doc.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 60,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-embed-invalid.txt',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, 'alpha beta gamma delta epsilon zeta eta theta iota kappa')
    const extractedJob = service.createDerivativeJob({
      id: 'job-embed-invalid-extracted',
      assetId: asset.id,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'phase-7-test',
    })
    await service.runDerivativeJob({ jobId: extractedJob.id })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-embedding-invalid',
      model: 'openrouter/embed-small',
      data: [{ index: 0, embedding: 'not-an-array' }],
      usage: { total_tokens: 9 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const embeddingJob = service.createDerivativeJob({
      id: 'job-embedding-invalid',
      assetId: asset.id,
      derivativeKind: 'embedding_vector',
      taskFamily: 'embeddings',
      generator: 'phase-7-test',
      modelId: 'openrouter/embed-small',
      configJson: { modelId: 'openrouter/embed-small', maxChunkChars: 10 },
    })
    const failed = await service.runDerivativeJob({ jobId: embeddingJob.id, apiKey: 'key' })
    expect(failed.job).toMatchObject({ status: 'failed', errorCode: 'embedding_response_invalid' })
    expect(failed.derivative).toBeNull()
    expect(service.getLatestReadyDerivative({ parentAssetId: asset.id, derivedKind: 'embedding_vector' })).toBeNull()
  })

  it('creates preview_optimized derivatives for png images with bounded dimensions while preserving aspect ratio', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const sourceBytes = createPngBytes(1200, 800)
    const asset = fileAssetRepo.create({
      id: 'asset-preview-png',
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: sourceBytes.byteLength,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-png.png',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, sourceBytes)
    const job = service.createDerivativeJob({
      id: 'job-preview-png',
      assetId: asset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
      configJson: { maxEdge: 384 },
    })
    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job).toMatchObject({ status: 'ready' })
    expect(result.derivative).toMatchObject({
      parentAssetId: asset.id,
      derivedKind: 'preview_optimized',
      mime: 'image/png',
    })
    expect(result.diagnosticSummary).toMatchObject({
      jobId: job.id,
      assetId: asset.id,
      derivativeKind: 'preview_optimized',
      status: 'ready',
      generator: 'phase-8-test',
      sourceMime: 'image/png',
      sourceWidth: 1200,
      sourceHeight: 800,
    })
    const derivativePath = path.join(rootDir, ...String(result.derivative?.storageUri).split('/'))
    const previewBytes = await readFile(derivativePath)
    const previewDecoded = PNG.sync.read(previewBytes)
    expect(previewDecoded.width).toBeLessThan(1200)
    expect(previewDecoded.height).toBeLessThan(800)
    expect(Math.max(previewDecoded.width, previewDecoded.height)).toBeLessThanOrEqual(384)
    expect(previewDecoded.width / previewDecoded.height).toBeCloseTo(1200 / 800, 1)
    expect(result.derivative?.metaJson).toMatchObject({
      sourceAssetId: asset.id,
      sourceMime: 'image/png',
      sourceWidth: 1200,
      sourceHeight: 800,
      previewWidth: previewDecoded.width,
      previewHeight: previewDecoded.height,
      sourceBytes: sourceBytes.byteLength,
      previewBytes: previewBytes.byteLength,
      generator: 'phase-8-test',
      format: 'png',
    })
    const originalPath = path.join(rootDir, ...asset.storageUri.split('/'))
    const originalAfter = await readFile(originalPath)
    expect(originalAfter.byteLength).toBe(sourceBytes.byteLength)
  })

  it('creates preview_optimized derivatives for jpeg images and exposes latest-ready preview lookup', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const sourceBytes = createJpegBytes(1024, 768)
    const asset = fileAssetRepo.create({
      id: 'asset-preview-jpeg',
      filename: 'photo.jpg',
      extension: 'jpg',
      mime: 'image/jpeg',
      sizeBytes: sourceBytes.byteLength,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-jpeg.jpg',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, asset.storageUri, sourceBytes)
    const job = service.createDerivativeJob({
      id: 'job-preview-jpeg',
      assetId: asset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
      configJson: { maxEdge: 256 },
    })
    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job.status).toBe('ready')
    expect(result.derivative?.mime).toBe('image/jpeg')
    const previewPath = path.join(rootDir, ...String(result.derivative?.storageUri).split('/'))
    const previewDecoded = jpeg.decode(await readFile(previewPath), { useTArray: true })
    expect(previewDecoded.width).toBeLessThan(1024)
    expect(previewDecoded.height).toBeLessThan(768)
    const latest = service.getLatestReadyPreviewDerivative(asset.id)
    expect(latest?.id).toBe(result.derivative?.id)
    const ensured = await service.ensurePreviewDerivative({ assetId: asset.id })
    expect(ensured).toMatchObject({
      reused: true,
      job: null,
      derivative: expect.objectContaining({ id: result.derivative?.id }),
      diagnosticSummary: expect.objectContaining({
        status: 'ready',
        derivativeKind: 'preview_optimized',
        outputDerivativeId: result.derivative?.id,
      }),
    })
  })

  it('fails preview jobs with explicit preview error codes and keeps source assets unchanged', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const textAsset = fileAssetRepo.create({
      id: 'asset-preview-text',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 5,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-text.txt',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, textAsset.storageUri, 'hello')
    const textJob = service.createDerivativeJob({
      id: 'job-preview-text',
      assetId: textAsset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
    })
    const nonImage = await service.runDerivativeJob({ jobId: textJob.id })
    expect(nonImage.job).toMatchObject({ status: 'failed', errorCode: 'preview_asset_not_image' })

    const missingAsset = fileAssetRepo.create({
      id: 'asset-preview-missing',
      filename: 'missing.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: 10,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-missing.png',
      ingestStatus: 'stored',
    })
    const missingJob = service.createDerivativeJob({
      id: 'job-preview-missing',
      assetId: missingAsset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
    })
    const missing = await service.runDerivativeJob({ jobId: missingJob.id })
    expect(missing.job).toMatchObject({ status: 'failed', errorCode: 'preview_local_file_missing' })

    const badPngAsset = fileAssetRepo.create({
      id: 'asset-preview-badpng',
      filename: 'bad.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: 10,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-badpng.png',
      ingestStatus: 'stored',
    })
    await writeAssetFile(rootDir, badPngAsset.storageUri, new Uint8Array([1, 2, 3, 4, 5]))
    const badJob = service.createDerivativeJob({
      id: 'job-preview-badpng',
      assetId: badPngAsset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
    })
    const bad = await service.runDerivativeJob({ jobId: badJob.id })
    expect(bad.job.status).toBe('failed')
    expect(['preview_generation_failed', 'preview_output_invalid']).toContain(String(bad.job.errorCode))
    expect(fileAssetRepo.getById(badPngAsset.id)?.ingestStatus).toBe('stored')

    const directoryAsset = fileAssetRepo.create({
      id: 'asset-preview-dir',
      filename: 'dir.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: 8,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-preview-dir.png',
      ingestStatus: 'stored',
    })
    await mkdir(path.join(rootDir, ...directoryAsset.storageUri.split('/')), { recursive: true })
    const directoryJob = service.createDerivativeJob({
      id: 'job-preview-dir',
      assetId: directoryAsset.id,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
    })
    const directoryRead = await service.runDerivativeJob({ jobId: directoryJob.id })
    expect(directoryRead.job).toMatchObject({ status: 'failed', errorCode: 'preview_local_file_read_failed' })
    expect(String(directoryRead.job.errorMessage ?? '')).not.toContain(rootDir)
  })

  it('keeps reserved derivative kinds as explicit unsupported jobs instead of executing them', async () => {
    const { fileAssetRepo, service } = await createHarness()
    const asset = fileAssetRepo.create({
      id: 'asset-reserved',
      filename: 'slide.pptx',
      extension: 'pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: 20,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-reserved.pptx',
      ingestStatus: 'stored',
    })
    const job = service.createDerivativeJob({
      id: 'job-reserved',
      assetId: asset.id,
      derivativeKind: 'converted_pdf',
      taskFamily: 'chat_context',
      generator: 'phase-7-test',
    })

    const result = await service.runDerivativeJob({ jobId: job.id })
    expect(result.job).toMatchObject({ status: 'failed', errorCode: 'conversion_not_implemented' })
    expect(result.derivative).toBeNull()

    const sendJob = service.createDerivativeJob({
      id: 'job-send-opt',
      assetId: asset.id,
      derivativeKind: 'send_optimized',
      taskFamily: 'chat_context',
      generator: 'phase-8-test',
    })
    const send = await service.runDerivativeJob({ jobId: sendJob.id })
    expect(send.job).toMatchObject({ status: 'failed', errorCode: 'derivative_kind_not_implemented' })
    expect(send.derivative).toBeNull()
    expect(fileAssetRepo.getById(asset.id)?.ingestStatus).toBe('stored')
  })
})
