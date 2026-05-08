import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { resolveManagedStoragePath } from '../../src/shared/files/localStorageResolver'
import type {
  CancelDerivativeJobInput,
  CapturePdfAnnotationDerivativeInput,
  CreateDerivativeJobInput,
  DerivativeErrorCode,
  DerivativeJobRecord,
  FileAssetRecord,
  FileDerivativeRecord,
  GetLatestReadyFileDerivativeInput,
  RetryDerivativeJobInput,
  RunDerivativeJobInput,
} from '../db/types'
import { DerivativeJobRepo } from '../db/repo/derivativeJobRepo'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileDerivativeRepo } from '../db/repo/fileDerivativeRepo'
import { ModelCatalogRepo } from '../db/repo/modelCatalogRepo'
import { getDerivativePath, getDerivativeStorageUri } from './fileStoragePaths'
import { generateImagePreview, normalizeImageMime } from './imagePreview'
import {
  requestEmbeddingsFromOpenRouter,
  requestTranscriptFromOpenRouter,
  type OpenRouterDerivativeTransport,
} from './openRouterDerivativeClient'
import { chunkTextForEmbeddings } from './textChunking'

type SqlDatabase = BetterSqlite3.Database

export type DerivativeRunResult = Readonly<{
  job: DerivativeJobRecord
  derivative: FileDerivativeRecord | null
  diagnosticSummary: DerivativeJobDiagnosticSummary
}>

export type CapturePdfAnnotationDerivativeResult = Readonly<{
  captured: DerivativeRunResult[]
  failed: Array<Readonly<{ assetId: string | null; errorCode: DerivativeErrorCode; message: string }>>
}>

export type EnsurePreviewDerivativeInput = Readonly<{
  assetId: string
  generator?: string
  maxEdge?: number
}>

export type EnsurePreviewDerivativeResult = Readonly<{
  reused: boolean
  job: DerivativeJobRecord | null
  derivative: FileDerivativeRecord | null
  diagnosticSummary: DerivativeJobDiagnosticSummary | null
}>

export type DerivativeJobDiagnosticSummary = Readonly<{
  jobId: string
  assetId: string
  derivativeKind: string
  status: DerivativeJobRecord['status']
  generator: string
  sourceMime: string | null
  sourceWidth: number | null
  sourceHeight: number | null
  previewWidth: number | null
  previewHeight: number | null
  sourceBytes: number | null
  previewBytes: number | null
  errorCode: DerivativeErrorCode | null
  outputDerivativeId: string | null
}>

export class DerivativeJobService {
  constructor(
    private deps: Readonly<{
      db: SqlDatabase
      fileAssetRepo: FileAssetRepo
      fileDerivativeRepo: FileDerivativeRepo
      derivativeJobRepo: DerivativeJobRepo
      modelCatalogRepo: ModelCatalogRepo
      storageRootDir: string
      now?: () => number
    }>
  ) {}

  createDerivativeJob(input: CreateDerivativeJobInput): DerivativeJobRecord {
    return this.deps.derivativeJobRepo.create(input)
  }

  getDerivativeJobById(id: string): DerivativeJobRecord | null {
    return this.deps.derivativeJobRepo.getById(id)
  }

  listDerivativeJobsByAssetId(assetId: string): DerivativeJobRecord[] {
    return this.deps.derivativeJobRepo.listByAssetId({ assetId })
  }

  getLatestReadyDerivative(input: GetLatestReadyFileDerivativeInput): FileDerivativeRecord | null {
    return this.deps.fileDerivativeRepo.getLatestReady(input)
  }

  getLatestReadyPreviewDerivative(assetId: string): FileDerivativeRecord | null {
    return this.getLatestReadyDerivative({
      parentAssetId: String(assetId ?? '').trim(),
      derivedKind: 'preview_optimized',
    })
  }

  cancelDerivativeJob(input: CancelDerivativeJobInput): DerivativeJobRecord {
    return this.deps.derivativeJobRepo.markCancelled(input)
  }

  async ensurePreviewDerivative(input: EnsurePreviewDerivativeInput): Promise<EnsurePreviewDerivativeResult> {
    const existing = this.getLatestReadyPreviewDerivative(input.assetId)
    if (existing) {
      return {
        reused: true,
        job: null,
        derivative: existing,
        diagnosticSummary: {
          jobId: 'reused',
          assetId: existing.parentAssetId,
          derivativeKind: existing.derivedKind,
          status: 'ready',
          generator: existing.generator,
          sourceMime: readStringMeta(existing.metaJson, 'sourceMime'),
          sourceWidth: readNumberMeta(existing.metaJson, 'sourceWidth'),
          sourceHeight: readNumberMeta(existing.metaJson, 'sourceHeight'),
          previewWidth: readNumberMeta(existing.metaJson, 'previewWidth'),
          previewHeight: readNumberMeta(existing.metaJson, 'previewHeight'),
          sourceBytes: readNumberMeta(existing.metaJson, 'sourceBytes'),
          previewBytes: readNumberMeta(existing.metaJson, 'previewBytes'),
          errorCode: null,
          outputDerivativeId: existing.id,
        },
      }
    }
    const job = this.createDerivativeJob({
      assetId: input.assetId,
      derivativeKind: 'preview_optimized',
      taskFamily: 'chat_context',
      generator: input.generator ?? 'phase-8-preview-ensure',
      configJson: {
        maxEdge: typeof input.maxEdge === 'number' && Number.isFinite(input.maxEdge) ? Math.floor(input.maxEdge) : 384,
      },
    })
    const ran = await this.runDerivativeJob({ jobId: job.id })
    return { reused: false, job: ran.job, derivative: ran.derivative, diagnosticSummary: ran.diagnosticSummary }
  }

  async retryDerivativeJob(input: RetryDerivativeJobInput): Promise<DerivativeRunResult> {
    const job = this.requireJob(input.jobId)
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new Error(`Derivative job ${job.id} is not retryable from status ${job.status}`)
    }
    this.deps.derivativeJobRepo.resetForRetry(job.id, this.now())
    return this.runDerivativeJob(input)
  }

  async runDerivativeJob(input: RunDerivativeJobInput): Promise<DerivativeRunResult> {
    const existing = this.requireJob(input.jobId)
    if (existing.status === 'cancelled') {
      throw derivativeError('derivative_task_cancelled', existing.id, existing.assetId, existing.derivativeKind, 'Derivative job is cancelled.')
    }

    const attemptCount = existing.attemptCount + 1
    const running = this.deps.derivativeJobRepo.markRunning(existing.id, attemptCount, this.now())
    try {
      switch (running.derivativeKind) {
        case 'extracted_text':
          return await this.runExtractedTextJob(running)
        case 'transcript':
          return await this.runTranscriptJob(running, input)
        case 'embedding_vector':
          return await this.runEmbeddingJob(running, input)
        case 'preview_optimized':
          return await this.runPreviewOptimizedJob(running)
        case 'converted_pdf':
          throw derivativeError(
            'conversion_not_implemented',
            running.id,
            running.assetId,
            running.derivativeKind,
            `Derivative kind ${running.derivativeKind} is reserved and intentionally not implemented in phase 8.`
          )
        case 'converted_markdown':
        case 'rendered_images':
        case 'selected_frames':
        case 'extracted_audio':
          throw derivativeError(
            'conversion_not_implemented',
            running.id,
            running.assetId,
            running.derivativeKind,
            `Derivative kind ${running.derivativeKind} is reserved for P4-C conversion engines and intentionally not implemented yet.`
          )
        case 'send_optimized':
        case 'thumbnail':
        case 'ocr_text':
          throw derivativeError(
            'derivative_kind_not_implemented',
            running.id,
            running.assetId,
            running.derivativeKind,
            `Derivative kind ${running.derivativeKind} is reserved and intentionally not implemented in phase 8.`
          )
        default:
          throw derivativeError(
            'derivative_asset_not_supported',
            running.id,
            running.assetId,
            running.derivativeKind,
            `Unsupported derivative kind ${String((running as any).derivativeKind)}.`
          )
      }
    } catch (error) {
      const mapped = normalizeDerivativeError(error, running, this.deps.storageRootDir)
      const failed = this.deps.derivativeJobRepo.markFailed(running.id, mapped.code, mapped.message, this.now())
      const output = this.resolveOutputDerivative(failed.outputDerivativeId)
      return {
        job: failed,
        derivative: output,
        diagnosticSummary: this.buildDiagnosticSummary(failed, output),
      }
    }
  }

  private async runPreviewOptimizedJob(job: DerivativeJobRecord): Promise<DerivativeRunResult> {
    const asset = this.deps.fileAssetRepo.getById(job.assetId)
    if (!asset) {
      throw derivativeError('preview_asset_missing', job.id, job.assetId, job.derivativeKind, `Preview source asset ${job.assetId} was not found.`)
    }
    if (asset.assetKind !== 'image') {
      throw derivativeError('preview_asset_not_image', job.id, asset.id, job.derivativeKind, 'Preview jobs only support image assets.')
    }
    const normalizedMime = normalizeImageMime(asset.mime)
    const normalizedExtension = String(asset.extension ?? '').trim().toLowerCase()
    const normalizedSourceMime =
      normalizedMime ??
      (normalizedExtension === 'png'
        ? 'image/png'
        : normalizedExtension === 'jpg' || normalizedExtension === 'jpeg'
          ? 'image/jpeg'
          : null)
    if (!normalizedSourceMime) {
      throw derivativeError('preview_source_not_supported', job.id, asset.id, job.derivativeKind, `Preview is not supported for source mime ${asset.mime ?? 'unknown'}.`)
    }

    const source = await this.readLocalBytes(asset, job, 'preview_local_file_missing', {
      missingCode: 'preview_local_file_missing',
      invalidCode: 'preview_source_not_supported',
      readCode: 'preview_local_file_read_failed',
    })
    const maxEdge = readPositiveConfigNumber(job.configJson, 'maxEdge') ?? 384
    const generated = (() => {
      try {
        return generateImagePreview(source.bytes, normalizedSourceMime, maxEdge)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview generation failed.'
        if (message.includes('preview_source_not_supported')) {
          throw derivativeError('preview_source_not_supported', job.id, asset.id, job.derivativeKind, 'Preview source type is not supported for resizing.')
        }
        if (message.includes('preview_output_invalid')) {
          throw derivativeError('preview_output_invalid', job.id, asset.id, job.derivativeKind, 'Generated preview output is invalid.')
        }
        throw derivativeError('preview_generation_failed', job.id, asset.id, job.derivativeKind, message)
      }
    })()
    if (generated.previewWidth <= 0 || generated.previewHeight <= 0 || generated.bytes.byteLength === 0) {
      throw derivativeError('preview_output_invalid', job.id, asset.id, job.derivativeKind, 'Generated preview output is invalid.')
    }

    const extension = generated.outputFormat === 'png' ? 'png' : 'jpg'
    const filePath = getDerivativePath({
      rootDir: this.deps.storageRootDir,
      parentAssetId: asset.id,
      derivativeId: job.outputDerivativeId ?? job.id,
      extension,
    })
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, Buffer.from(generated.bytes)).catch((error) => {
      throw derivativeError('preview_output_write_failed', job.id, asset.id, job.derivativeKind, error instanceof Error ? error.message : 'Failed to write preview output.')
    })
    const previewBytes = Buffer.from(generated.bytes)
    const derivative = this.createOrUpdateFileDerivative({
      job,
      asset,
      mime: generated.outputMime,
      storageUri: getDerivativeStorageUri({
        parentAssetId: asset.id,
        derivativeId: job.outputDerivativeId ?? job.id,
        extension,
      }),
      metaJson: {
        sourceAssetId: asset.id,
        sourceMime: asset.mime ?? normalizedSourceMime,
        sourceWidth: generated.sourceWidth,
        sourceHeight: generated.sourceHeight,
        previewWidth: generated.previewWidth,
        previewHeight: generated.previewHeight,
        sourceBytes: asset.sizeBytes,
        previewBytes: previewBytes.byteLength,
        generator: job.generator,
        format: generated.outputFormat,
        createdAt: this.now(),
        sourceHash: asset.sha256 ?? null,
        previewHash: sha256Bytes(previewBytes),
      },
    })
    return this.markReady(job, derivative)
  }

  async capturePdfAnnotations(input: CapturePdfAnnotationDerivativeInput): Promise<CapturePdfAnnotationDerivativeResult> {
    const assetIds = Array.from(new Set((input.assetIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
    if (assetIds.length === 0) {
      return { captured: [], failed: [{ assetId: null, errorCode: 'pdf_annotation_missing', message: 'No PDF asset ids were provided.' }] }
    }

    const loadedAnnotations = this.loadMessageAnnotations(input.messageId)
    if (loadedAnnotations.kind === 'missing') {
      return { captured: [], failed: assetIds.map((assetId) => ({ assetId, errorCode: 'pdf_annotation_missing' as const, message: 'Message has no stored PDF annotations.' })) }
    }
    if (loadedAnnotations.kind === 'parse_failed') {
      const assets = this.deps.fileAssetRepo.listByIds({ ids: assetIds })
      const byId = new Map(assets.map((asset) => [asset.id, asset]))
      const failures: Array<Readonly<{ assetId: string | null; errorCode: DerivativeErrorCode; message: string }>> = []
      for (const assetId of assetIds) {
        if (!byId.has(assetId)) {
          failures.push({ assetId, errorCode: 'derivative_asset_missing', message: `PDF asset ${assetId} is missing while capturing annotations.` })
          continue
        }
        const failedJob = this.createAndMarkFailedPdfAnnotationJob({
          assetId,
          generator: input.generator ?? 'phase-7-pdf-annotation-capture',
          errorCode: 'pdf_annotation_parse_failed',
          message: loadedAnnotations.message,
        })
        failures.push({
          assetId,
          errorCode: 'pdf_annotation_parse_failed',
          message: `Failed to parse stored PDF annotations for extracted_text (jobId=${failedJob.id}, derivativeKind=${failedJob.derivativeKind}).`,
        })
      }
      return { captured: [], failed: failures }
    }

    const annotations = loadedAnnotations.annotations
    const assets = this.deps.fileAssetRepo.listByIds({ ids: assetIds })
    const byId = new Map(assets.map((asset) => [asset.id, asset]))
    const results: DerivativeRunResult[] = []
    const failures: Array<Readonly<{ assetId: string | null; errorCode: DerivativeErrorCode; message: string }>> = []
    const matchedAssets = new Set<string>()
    const extracted = extractPdfAnnotationCandidates(annotations)

    for (const candidate of extracted.candidates) {
      const asset = selectPdfAnnotationAsset(candidate, assets)
      if (!asset) continue
      matchedAssets.add(asset.id)
      try {
        const job = this.createDerivativeJob({
          assetId: asset.id,
          derivativeKind: 'extracted_text',
          taskFamily: 'chat_context',
          generator: input.generator ?? 'phase-7-pdf-annotation-capture',
          inputSnapshotJson: {
            source: 'pdf_annotation',
            annotationHash: candidate.fileHash ?? null,
            annotationFileName: candidate.fileName ?? null,
            textLength: candidate.text.length,
            contentPartTypes: candidate.contentPartTypes,
          },
          configJson: {
            source: 'pdf_annotation',
          },
        })
        results.push(await this.runPdfAnnotationTextJob(job, asset, candidate))
      } catch (error) {
        const mapped = normalizeDerivativeError(
          error,
          {
            id: 'capture',
            assetId: asset.id,
            derivativeKind: 'extracted_text',
            taskFamily: 'chat_context',
          } as DerivativeJobRecord,
          this.deps.storageRootDir
        )
        failures.push({ assetId: asset.id, errorCode: mapped.code, message: mapped.message })
      }
    }

    for (const parseFailure of extracted.parseFailures) {
      const asset = selectPdfAnnotationAsset(parseFailure, assets)
      if (!asset) continue
      matchedAssets.add(asset.id)
      const failedJob = this.createAndMarkFailedPdfAnnotationJob({
        assetId: asset.id,
        generator: input.generator ?? 'phase-7-pdf-annotation-capture',
        errorCode: 'pdf_annotation_parse_failed',
        message: parseFailure.message,
      })
      failures.push({
        assetId: asset.id,
        errorCode: 'pdf_annotation_parse_failed',
        message: `Failed to parse PDF annotation content (jobId=${failedJob.id}, derivativeKind=${failedJob.derivativeKind}).`,
      })
    }

    for (const assetId of assetIds) {
      if (matchedAssets.has(assetId)) continue
      const asset = byId.get(assetId) ?? null
      failures.push({
        assetId,
        errorCode: 'pdf_annotation_missing',
        message: asset
          ? `No reusable PDF annotation text matched asset ${asset.filename}.`
          : 'PDF asset is missing while capturing annotations.',
      })
    }

    return { captured: results, failed: failures }
  }

  private async runExtractedTextJob(job: DerivativeJobRecord): Promise<DerivativeRunResult> {
    const asset = this.requireAsset(job.assetId)
    const ext = String(asset.extension ?? '').trim().toLowerCase()
    if (OFFICE_TEXT_NOT_IMPLEMENTED_EXTENSIONS.has(ext)) {
      throw derivativeError(
        'conversion_not_implemented',
        job.id,
        asset.id,
        job.derivativeKind,
        `Structured conversion for .${ext} is not implemented yet. XLSX/XLS formula/hidden/merged diagnostics and DOCX rich-structure extraction require the Step 4 conversion engine.`
      )
    }
    if (asset.assetKind !== 'text' && !isPdfAnnotationJob(job)) {
      throw derivativeError('derivative_asset_not_supported', job.id, asset.id, job.derivativeKind, 'Extracted text only supports text assets or captured PDF annotations in phase 7.')
    }

    const read = await this.readAssetText(asset)
    const targetKind = inferTextTargetKind(asset, read.text)
    const convertedText = convertTextForTarget(read.text, targetKind)
    const conversionWarnings = collectTextConversionWarnings(asset, targetKind)
    if (!convertedText.trim()) {
      throw derivativeError('extracted_text_empty', job.id, asset.id, job.derivativeKind, 'No text content could be extracted from the asset.')
    }
    const contentHash = sha256(convertedText)

    const derivative = await this.writeTextDerivative({
      job,
      asset,
      text: convertedText,
      mime: targetKind === 'markdown' || targetKind === 'table_markdown' ? 'text/markdown' : 'text/plain',
      metaJson: {
        sourceMime: asset.mime ?? null,
        sourceExtension: asset.extension ?? null,
        sourceEncoding: read.encoding ?? null,
        sourceHash: asset.sha256 ?? null,
        contentHash,
        targetKind,
        usage: 'preview_and_send',
        characterCount: convertedText.length,
        byteLength: Buffer.byteLength(convertedText, 'utf8'),
        filename: asset.filename,
        conversionWarnings,
      },
    })
    return this.markReady(job, derivative)
  }

  private async runPdfAnnotationTextJob(
    job: DerivativeJobRecord,
    asset: FileAssetRecord,
    candidate: PdfAnnotationCandidate
  ): Promise<DerivativeRunResult> {
    const derivative = await this.writeTextDerivative({
      job,
      asset,
      text: candidate.text,
      mime: 'text/plain',
      metaJson: {
        source: 'pdf_annotation',
        annotationHash: candidate.fileHash ?? null,
        annotationFileName: candidate.fileName ?? null,
        annotationContentPartTypes: candidate.contentPartTypes,
        annotationTextPreview: summarizeTextPreview(candidate.text),
        characterCount: candidate.text.length,
      },
    })
    return this.markReady(job, derivative)
  }

  private async runTranscriptJob(job: DerivativeJobRecord, input: RunDerivativeJobInput): Promise<DerivativeRunResult> {
    const asset = this.requireAsset(job.assetId)
    if (asset.assetKind !== 'audio') {
      throw derivativeError('derivative_asset_not_supported', job.id, asset.id, job.derivativeKind, 'Transcript jobs only support audio assets.')
    }

    const source = await this.readLocalBytes(asset, job, 'audio_url_not_supported_for_transcript')
    const transport = normalizeTransport(input)
    const modelId = requireStringFromConfig(job.configJson, 'modelId', 'transcript_model_missing', job)
    this.assertAudioModelCapability(modelId, job)
    const audioFormat = audioFormatFromAsset(asset)
    const transcript = await requestTranscriptFromOpenRouter(transport, {
      modelId,
      prompt: buildTranscriptPrompt(job.configJson),
      audioBase64: Buffer.from(source.bytes).toString('base64'),
      audioFormat,
    }).catch((error) => {
      throw mapProviderRequestError(error, {
        jobId: job.id,
        assetId: asset.id,
        derivativeKind: job.derivativeKind,
        fallbackCode: 'transcript_request_failed',
      })
    })

    const text = transcript.text.trim()
    if (!text) {
      throw derivativeError('extracted_text_empty', job.id, asset.id, job.derivativeKind, 'Transcript response did not contain text.')
    }

    const derivative = await this.writeTextDerivative({
      job,
      asset,
      text,
      mime: 'text/plain',
      metaJson: {
        provider: transport.baseUrl ?? 'https://openrouter.ai/api/v1',
        modelId,
        audioFormat,
        language: readNullableConfigString(job.configJson, 'language'),
        durationMs: null,
        usage: transcript.usage,
        responseId: transcript.responseId,
        characterCount: text.length,
      },
    })
    return this.markReady(job, derivative)
  }

  private async runEmbeddingJob(job: DerivativeJobRecord, input: RunDerivativeJobInput): Promise<DerivativeRunResult> {
    const asset = this.requireAsset(job.assetId)
    const modelId = requireStringFromConfig(job.configJson, 'modelId', 'embedding_model_missing', job)
    const transport = normalizeTransport(input)
    const sourceText = await this.loadEmbeddingSourceText(asset, job)
    if (!sourceText.trim()) {
      throw derivativeError('embedding_input_empty', job.id, asset.id, job.derivativeKind, 'Embedding input text is empty.')
    }

    const chunks = chunkTextForEmbeddings(sourceText, {
      maxChars: readPositiveConfigNumber(job.configJson, 'maxChunkChars') ?? 2000,
    })
    if (chunks.length === 0) {
      throw derivativeError('embedding_input_empty', job.id, asset.id, job.derivativeKind, 'Embedding input text produced no chunks.')
    }

    const payload = chunks.length === 1 ? chunks[0].text : chunks.map((chunk) => chunk.text)
    const response = await requestEmbeddingsFromOpenRouter(transport, {
      modelId,
      input: payload,
    }).catch((error) => {
      throw mapProviderRequestError(error, {
        jobId: job.id,
        assetId: asset.id,
        derivativeKind: job.derivativeKind,
        fallbackCode: 'embedding_request_failed',
      })
    })

    if (response.embeddings.length !== chunks.length || response.embeddings.some((row) => row.embedding.length === 0)) {
      throw derivativeError('embedding_response_invalid', job.id, asset.id, job.derivativeKind, 'Embedding response did not match the requested chunk count.')
    }

    const dimension = response.embeddings[0]?.embedding.length ?? 0
    const filePayload = {
      modelId: response.model,
      provider: transport.baseUrl ?? 'https://openrouter.ai/api/v1',
      responseId: response.responseId,
      usage: response.usage,
      inputHash: sha256(sourceText),
      encodingFormat: 'float',
      chunks: chunks.map((chunk, index) => ({
        chunkIndex: chunk.chunkIndex,
        start: chunk.start,
        end: chunk.end,
        textLength: chunk.text.length,
        dimension: response.embeddings[index]?.embedding.length ?? 0,
        embedding: response.embeddings[index]?.embedding ?? [],
      })),
    }

    const derivative = await this.writeJsonDerivative({
      job,
      asset,
      payload: filePayload,
      mime: 'application/json',
      extension: 'json',
      metaJson: {
        modelId: response.model,
        provider: transport.baseUrl ?? 'https://openrouter.ai/api/v1',
        dimension,
        chunkCount: chunks.length,
        inputHash: filePayload.inputHash,
        encodingFormat: 'float',
        usage: response.usage,
      },
    }).catch((error) => {
      throw derivativeError('embedding_output_write_failed', job.id, asset.id, job.derivativeKind, error instanceof Error ? error.message : 'Embedding output write failed.')
    })

    return this.markReady(job, derivative)
  }

  private async loadEmbeddingSourceText(asset: FileAssetRecord, job: DerivativeJobRecord): Promise<string> {
    const extracted = this.deps.fileDerivativeRepo.getLatestReady({
      parentAssetId: asset.id,
      derivedKind: 'extracted_text',
    })
    if (extracted) return this.readDerivativeText(extracted, job)

    const transcript = this.deps.fileDerivativeRepo.getLatestReady({
      parentAssetId: asset.id,
      derivedKind: 'transcript',
    })
    if (transcript) return this.readDerivativeText(transcript, job)

    if (asset.assetKind === 'text') {
      const read = await this.readAssetText(asset)
      return read.text
    }

    throw derivativeError('embedding_input_empty', job.id, asset.id, job.derivativeKind, 'No extracted_text or transcript derivative is available for embeddings.')
  }

  private async readDerivativeText(derivative: FileDerivativeRecord, job: DerivativeJobRecord): Promise<string> {
    const resolved = resolveManagedStoragePath(this.deps.storageRootDir, derivative.storageUri, {
      backend: 'local_fs',
      deletedAt: derivative.deletedAt,
    })
    if (resolved.kind !== 'ok') {
      throw derivativeError(
        resolved.kind === 'missing' ? 'derivative_local_file_missing' : resolved.code === 'attachment_local_path_outside_storage_root' ? 'derivative_local_file_missing' : 'derivative_input_missing',
        job.id,
        derivative.parentAssetId,
        job.derivativeKind,
        resolved.kind === 'missing' ? 'Derivative source file is missing.' : resolved.message
      )
    }
    const bytes = await readFile(resolved.path).catch((error) => {
      throw derivativeError('derivative_local_file_read_failed', job.id, derivative.parentAssetId, job.derivativeKind, error instanceof Error ? error.message : 'Failed to read derivative source text.')
    })
    return Buffer.from(bytes).toString('utf8')
  }

  private async readAssetText(asset: FileAssetRecord): Promise<Readonly<{ text: string; encoding: string }>> {
    const source = await this.readLocalBytes(asset, null, 'derivative_input_missing')
    const text = decodeUtf8Text(source.bytes)
    if (looksBinaryText(text)) {
      throw derivativeError('derivative_input_missing', 'unknown', asset.id, 'extracted_text', 'Input appears to be binary and cannot be decoded as UTF-8 text.')
    }
    return {
      text,
      encoding: 'utf-8',
    }
  }

  private async readLocalBytes(
    asset: FileAssetRecord,
    job: DerivativeJobRecord | null,
    urlErrorCode: DerivativeErrorCode,
    overrides?: Readonly<{
      missingCode?: DerivativeErrorCode
      invalidCode?: DerivativeErrorCode
      readCode?: DerivativeErrorCode
    }>
  ): Promise<Readonly<{ bytes: Uint8Array; path: string }>> {
    if (asset.storageBackend === 'remote_url') {
      throw derivativeError(urlErrorCode, job?.id ?? 'unknown', asset.id, job?.derivativeKind ?? 'transcript', 'Derivative jobs in phase 7 require a retained local file copy.')
    }
    const resolved = resolveManagedStoragePath(this.deps.storageRootDir, asset.storageUri, {
      backend: asset.storageBackend,
      deletedAt: asset.deletedAt,
    })
    if (resolved.kind === 'missing') {
      throw derivativeError(overrides?.missingCode ?? 'derivative_local_file_missing', job?.id ?? 'unknown', asset.id, job?.derivativeKind ?? 'extracted_text', 'Asset local file copy is missing.')
    }
    if (resolved.kind === 'invalid') {
      throw derivativeError(overrides?.invalidCode ?? 'derivative_input_missing', job?.id ?? 'unknown', asset.id, job?.derivativeKind ?? 'extracted_text', resolved.message)
    }
    const bytes = await readFile(resolved.path).catch((error) => {
      if (error && typeof error === 'object' && String((error as any).code ?? '').trim().toUpperCase() === 'ENOENT') {
        throw derivativeError(overrides?.missingCode ?? 'derivative_local_file_missing', job?.id ?? 'unknown', asset.id, job?.derivativeKind ?? 'extracted_text', 'Asset local file copy is missing.')
      }
      throw derivativeError(overrides?.readCode ?? 'derivative_local_file_read_failed', job?.id ?? 'unknown', asset.id, job?.derivativeKind ?? 'extracted_text', error instanceof Error ? error.message : 'Failed to read local asset.')
    })
    return { bytes: new Uint8Array(bytes), path: resolved.path }
  }

  private async writeTextDerivative(input: Readonly<{
    job: DerivativeJobRecord
    asset: FileAssetRecord
    text: string
    mime: string
    metaJson: Record<string, unknown>
  }>): Promise<FileDerivativeRecord> {
    const normalizedText = normalizeLineEndings(input.text)
    if (!normalizedText.trim()) {
      throw derivativeError('extracted_text_empty', input.job.id, input.asset.id, input.job.derivativeKind, 'Derivative text output is empty.')
    }
    const filePath = getDerivativePath({
      rootDir: this.deps.storageRootDir,
      parentAssetId: input.asset.id,
      derivativeId: input.job.outputDerivativeId ?? input.job.id,
      extension: 'txt',
    })
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, normalizedText, 'utf8').catch((error) => {
      throw derivativeError('derivative_output_write_failed', input.job.id, input.asset.id, input.job.derivativeKind, error instanceof Error ? error.message : 'Failed to write derivative text output.')
    })
    return this.createOrUpdateFileDerivative({
      job: input.job,
      asset: input.asset,
      mime: input.mime,
      storageUri: getDerivativeStorageUri({
        parentAssetId: input.asset.id,
        derivativeId: input.job.outputDerivativeId ?? input.job.id,
        extension: 'txt',
      }),
      metaJson: input.metaJson,
    })
  }

  private async writeJsonDerivative(input: Readonly<{
    job: DerivativeJobRecord
    asset: FileAssetRecord
    payload: Record<string, unknown>
    mime: string
    extension: string
    metaJson: Record<string, unknown>
  }>): Promise<FileDerivativeRecord> {
    const filePath = getDerivativePath({
      rootDir: this.deps.storageRootDir,
      parentAssetId: input.asset.id,
      derivativeId: input.job.outputDerivativeId ?? input.job.id,
      extension: input.extension,
    })
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(input.payload), 'utf8')
    return this.createOrUpdateFileDerivative({
      job: input.job,
      asset: input.asset,
      mime: input.mime,
      storageUri: getDerivativeStorageUri({
        parentAssetId: input.asset.id,
        derivativeId: input.job.outputDerivativeId ?? input.job.id,
        extension: input.extension,
      }),
      metaJson: input.metaJson,
    })
  }

  private createOrUpdateFileDerivative(input: Readonly<{
    job: DerivativeJobRecord
    asset: FileAssetRecord
    mime: string
    storageUri: string
    metaJson: Record<string, unknown>
  }>): FileDerivativeRecord {
    const existingId = input.job.outputDerivativeId
    if (existingId) {
      return this.deps.fileDerivativeRepo.update({
        id: existingId,
        mime: input.mime,
        storageUri: input.storageUri,
        generator: input.job.generator,
        status: 'ready',
        metaJson: input.metaJson,
        updatedAt: this.now(),
        deletedAt: null,
      })
    }
    return this.deps.fileDerivativeRepo.create({
      id: input.job.id,
      parentAssetId: input.asset.id,
      derivedKind: input.job.derivativeKind,
      mime: input.mime,
      storageUri: input.storageUri,
      generator: input.job.generator,
      status: 'ready',
      metaJson: input.metaJson,
      createdAt: this.now(),
      updatedAt: this.now(),
    })
  }

  private markReady(job: DerivativeJobRecord, derivative: FileDerivativeRecord): DerivativeRunResult {
    const ready = this.deps.derivativeJobRepo.markReady(job.id, derivative.id, this.now())
    return {
      job: ready,
      derivative,
      diagnosticSummary: this.buildDiagnosticSummary(ready, derivative),
    }
  }

  private resolveOutputDerivative(outputDerivativeId: string | null): FileDerivativeRecord | null {
    if (!outputDerivativeId) return null
    return this.deps.fileDerivativeRepo.getById(outputDerivativeId)
  }

  private requireAsset(assetId: string): FileAssetRecord {
    const asset = this.deps.fileAssetRepo.getById(assetId)
    if (!asset) {
      throw derivativeError('derivative_asset_missing', 'unknown', assetId, 'extracted_text', `Asset ${assetId} was not found.`)
    }
    return asset
  }

  private requireJob(jobId: string): DerivativeJobRecord {
    const job = this.deps.derivativeJobRepo.getById(jobId)
    if (!job) throw new Error(`Derivative job not found: ${jobId}`)
    return job
  }

  private assertAudioModelCapability(modelId: string, job: DerivativeJobRecord): void {
    const detail = this.deps.modelCatalogRepo.getCoreModelDetail('openrouter', modelId)
    if (!detail) {
      throw derivativeError('transcript_model_missing', job.id, job.assetId, job.derivativeKind, `Transcript model ${modelId} is not available in the model catalog.`)
    }
    const modalities = safeParseStringArray(detail.inputModalitiesJson)
    if (!modalities.includes('audio')) {
      throw derivativeError('transcript_model_not_audio_capable', job.id, job.assetId, job.derivativeKind, `Transcript model ${modelId} does not support audio input.`)
    }
  }

  private loadMessageAnnotations(messageId: string): MessageAnnotationLoadResult {
    const row = this.deps.db.prepare(`
      SELECT annotations_json AS annotationsJson
      FROM message
      WHERE id = @id
      LIMIT 1
    `).get({ id: String(messageId ?? '').trim() }) as { annotationsJson?: string | null } | undefined
    if (!row?.annotationsJson) return { kind: 'missing' as const }
    try {
      const parsed = JSON.parse(row.annotationsJson)
      if (!Array.isArray(parsed)) {
        return {
          kind: 'parse_failed' as const,
          message: 'Stored message annotations are not a JSON array.',
        }
      }
      return { kind: 'ok' as const, annotations: parsed }
    } catch (error) {
      return {
        kind: 'parse_failed' as const,
        message: error instanceof Error ? `Stored message annotations JSON parse failed: ${error.message}` : 'Stored message annotations JSON parse failed.',
      }
    }
  }

  private createAndMarkFailedPdfAnnotationJob(input: Readonly<{
    assetId: string
    generator: string
    errorCode: DerivativeErrorCode
    message: string
  }>): DerivativeJobRecord {
    const job = this.createDerivativeJob({
      assetId: input.assetId,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: input.generator,
      configJson: { source: 'pdf_annotation' },
    })
    return this.deps.derivativeJobRepo.markFailed(job.id, input.errorCode, input.message, this.now())
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now()
  }

  private buildDiagnosticSummary(
    job: Pick<DerivativeJobRecord, 'id' | 'assetId' | 'derivativeKind' | 'status' | 'generator' | 'errorCode' | 'outputDerivativeId'>,
    derivative: Pick<FileDerivativeRecord, 'id' | 'metaJson'> | null
  ): DerivativeJobDiagnosticSummary {
    const meta = derivative?.metaJson ?? null
    return {
      jobId: job.id,
      assetId: job.assetId,
      derivativeKind: job.derivativeKind,
      status: job.status,
      generator: job.generator,
      sourceMime: readStringMeta(meta, 'sourceMime'),
      sourceWidth: readNumberMeta(meta, 'sourceWidth'),
      sourceHeight: readNumberMeta(meta, 'sourceHeight'),
      previewWidth: readNumberMeta(meta, 'previewWidth'),
      previewHeight: readNumberMeta(meta, 'previewHeight'),
      sourceBytes: readNumberMeta(meta, 'sourceBytes'),
      previewBytes: readNumberMeta(meta, 'previewBytes'),
      errorCode: job.errorCode ?? null,
      outputDerivativeId: derivative?.id ?? job.outputDerivativeId ?? null,
    }
  }
}

function inferTextTargetKind(asset: FileAssetRecord, sourceText: string): 'plain_text' | 'markdown' | 'code' | 'table_markdown' {
  const ext = String(asset.extension ?? '').trim().toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'csv' || ext === 'tsv') return 'table_markdown'
  if (HTML_MARKDOWN_EXTENSIONS.has(ext) || normalizeMime(asset.mime) === 'text/html') {
    return inferHtmlTargetKind(sourceText)
  }
  if (PS_CODE_EXTENSIONS.has(ext) || normalizeMime(asset.mime) === 'application/postscript') return 'code'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'plain_text'
}

const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'sql', 'go', 'rs',
  'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt',
  'scala', 'lua', 'dockerfile',
])

const OFFICE_TEXT_NOT_IMPLEMENTED_EXTENSIONS = new Set([
  'docx',
  'doc',
  'rtf',
  'xlsx',
  'xls',
])

const HTML_MARKDOWN_EXTENSIONS = new Set([
  'html',
  'htm',
])

const PS_CODE_EXTENSIONS = new Set([
  'ps',
  'eps',
])

function convertTextForTarget(source: string, targetKind: 'plain_text' | 'markdown' | 'code' | 'table_markdown'): string {
  const normalized = normalizeLineEndings(source)
  if (targetKind === 'markdown' && looksLikeHtmlDocument(normalized)) {
    return htmlToMarkdownSafe(normalized)
  }
  if (targetKind === 'table_markdown') {
    const delimiter = detectDelimiter(normalized)
    const rows = parseDelimitedRows(normalized, delimiter)
    return toMarkdownTable(rows)
  }
  return normalized
}

function collectTextConversionWarnings(
  asset: FileAssetRecord,
  targetKind: 'plain_text' | 'markdown' | 'code' | 'table_markdown'
): string[] {
  const ext = String(asset.extension ?? '').trim().toLowerCase()
  const mime = normalizeMime(asset.mime)
  if ((HTML_MARKDOWN_EXTENSIONS.has(ext) || mime === 'text/html') && targetKind === 'markdown') {
    return [
      'html_javascript_not_executed',
      'html_external_resources_not_loaded',
      'html_script_style_removed_from_markdown',
    ]
  }
  return []
}

function inferHtmlTargetKind(source: string): 'markdown' | 'code' {
  const normalized = normalizeLineEndings(source)
  if (/[{][{%#]/.test(normalized) || /{{|<script\b/i.test(normalized)) return 'code'
  return 'markdown'
}

function looksLikeHtmlDocument(value: string): boolean {
  return /<\s*(html|head|body|article|section|div|p|h[1-6])\b/i.test(value)
}

function htmlToMarkdownSafe(input: string): string {
  const withoutScript = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const withoutStyle = withoutScript.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  const withBreaks = withoutStyle
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<\s*\/h([1-6])\s*>/gi, '\n\n')
    .replace(/<\s*h1\b[^>]*>/gi, '# ')
    .replace(/<\s*h2\b[^>]*>/gi, '## ')
    .replace(/<\s*h3\b[^>]*>/gi, '### ')
    .replace(/<\s*h4\b[^>]*>/gi, '#### ')
    .replace(/<\s*h5\b[^>]*>/gi, '##### ')
    .replace(/<\s*h6\b[^>]*>/gi, '###### ')
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ')
  const decoded = decodeBasicHtmlEntities(withoutTags)
  return decoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeBasicHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeMime(value: string | null): string | null {
  const raw = String(value ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return raw || null
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function decodeUtf8Text(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = decoder.decode(bytes)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return normalizeLineEndings(text)
}

function looksBinaryText(text: string): boolean {
  return text.includes('\u0000')
}

function detectDelimiter(input: string): ',' | '\t' {
  const firstLine = input.split('\n', 1)[0] ?? ''
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const tabCount = (firstLine.match(/\t/g) ?? []).length
  return tabCount > commaCount ? '\t' : ','
}

function parseDelimitedRows(input: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!
    const next = input[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
        continue
      }
      if (ch === '"') {
        inQuotes = false
        continue
      }
      field += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += ch
  }

  row.push(field)
  if (row.length > 1 || row[0] !== '' || rows.length === 0) {
    rows.push(row)
  }
  return rows
}

function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length), 1)
  const normalized = rows.map((row) => {
    const out = [...row]
    while (out.length < width) out.push('')
    return out
  })
  const header = normalized[0]!
  const body = normalized.slice(1)
  const headerLine = `| ${header.map(escapeMarkdownCell).join(' | ')} |`
  const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
  const bodyLines = body.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`)
  return [headerLine, separator, ...bodyLines].join('\n')
}

function escapeMarkdownCell(value: string): string {
  return normalizeLineEndings(String(value ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
    .trim()
}

type PdfAnnotationCandidate = Readonly<{
  fileHash: string | null
  fileName: string | null
  text: string
  contentPartTypes: string[]
}>

type PdfAnnotationParseFailure = Readonly<{
  fileHash: string | null
  fileName: string | null
  message: string
}>

type MessageAnnotationLoadResult =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'ok'; annotations: unknown[] }>
  | Readonly<{ kind: 'parse_failed'; message: string }>

function extractPdfAnnotationCandidates(annotations: unknown[]): Readonly<{
  candidates: PdfAnnotationCandidate[]
  parseFailures: PdfAnnotationParseFailure[]
}> {
  const candidates: PdfAnnotationCandidate[] = []
  const parseFailures: PdfAnnotationParseFailure[] = []
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue
    const file = (annotation as any).file
    if (!file || typeof file !== 'object') continue
    const fileName = normalizeNullable((file as any).name)
    const fileHash = normalizeNullable((file as any).hash)
    const rawContent = (file as any).content
    const content = Array.isArray(rawContent)
      ? rawContent
      : typeof rawContent === 'string'
        ? [{ type: 'text', text: rawContent }]
        : null
    if (!content) {
      parseFailures.push({
        fileHash,
        fileName,
        message: 'PDF annotation file.content must be an array or a string.',
      })
      continue
    }
    const contentPartTypes: string[] = []
    const textParts: string[] = []
    let isMalformed = false
    for (const part of content) {
      if (!part || typeof part !== 'object') {
        isMalformed = true
        break
      }
      const partType = typeof (part as any).type === 'string' ? String((part as any).type) : ''
      if (!partType) {
        isMalformed = true
        break
      }
      contentPartTypes.push(partType)
      if (partType !== 'text') continue
      if (typeof (part as any).text !== 'string') {
        isMalformed = true
        break
      }
      const text = String((part as any).text).trim()
      if (text) textParts.push(text)
    }
    if (isMalformed) {
      parseFailures.push({
        fileHash,
        fileName,
        message: 'PDF annotation file.content contains malformed parts.',
      })
      continue
    }
    const text = textParts.join('\n').trim()
    if (!text) continue
    candidates.push({ fileHash, fileName, text, contentPartTypes })
  }
  return { candidates, parseFailures }
}

function selectPdfAnnotationAsset(candidate: Pick<PdfAnnotationCandidate, 'fileHash' | 'fileName'>, assets: FileAssetRecord[]): FileAssetRecord | null {
  if (assets.length === 1) return assets[0] ?? null
  if (candidate.fileHash) {
    const byHash = assets.find((asset) => normalizeNullable(asset.sha256) === candidate.fileHash)
    if (byHash) return byHash
  }
  if (candidate.fileName) {
    const byName = assets.find((asset) => asset.filename === candidate.fileName)
    if (byName) return byName
  }
  return null
}

function normalizeTransport(input: RunDerivativeJobInput): OpenRouterDerivativeTransport {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) throw new Error('OpenRouter API key is required to run provider-backed derivative jobs.')
  return {
    apiKey,
    baseUrl: normalizeNullable(input.baseUrl),
    timeoutMs: typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) ? input.timeoutMs : null,
  }
}

function requireStringFromConfig(
  configJson: Record<string, unknown> | null,
  key: string,
  errorCode: DerivativeErrorCode,
  job: DerivativeJobRecord
): string {
  const value = readNullableConfigString(configJson, key)
  if (!value) throw derivativeError(errorCode, job.id, job.assetId, job.derivativeKind, `Derivative job config is missing ${key}.`)
  return value
}

function readNullableConfigString(configJson: Record<string, unknown> | null, key: string): string | null {
  const value = configJson?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readPositiveConfigNumber(configJson: Record<string, unknown> | null, key: string): number | null {
  const value = Number(configJson?.[key])
  return Number.isFinite(value) && value > 0 ? value : null
}

function buildTranscriptPrompt(configJson: Record<string, unknown> | null): string {
  const language = readNullableConfigString(configJson, 'language')
  return language
    ? `Transcribe the provided audio into plain text. Keep the wording faithful. Language hint: ${language}.`
    : 'Transcribe the provided audio into plain text. Keep the wording faithful and do not add commentary.'
}

function audioFormatFromAsset(asset: FileAssetRecord): string {
  const extension = String(asset.extension ?? '').trim().toLowerCase()
  if (extension) return extension
  const mime = String(asset.mime ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return mime.startsWith('audio/') ? mime.slice('audio/'.length) : 'wav'
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(value)).digest('hex')
}

function safeParseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean) : []
  } catch {
    return []
  }
}

function summarizeTextPreview(text: string): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 160)}…`
}

function normalizeNullable(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function derivativeError(
  code: DerivativeErrorCode,
  jobId: string,
  assetId: string,
  derivativeKind: string,
  message: string
): Error & Readonly<{ code: DerivativeErrorCode; jobId: string; assetId: string; derivativeKind: string }> {
  const error = new Error(message) as Error & Readonly<{ code: DerivativeErrorCode; jobId: string; assetId: string; derivativeKind: string }>
  Object.assign(error, { code, jobId, assetId, derivativeKind })
  return error
}

function normalizeDerivativeError(
  error: unknown,
  job: Pick<DerivativeJobRecord, 'id' | 'assetId' | 'derivativeKind'>,
  storageRootDir: string
): Readonly<{ code: DerivativeErrorCode; message: string }> {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as any).code) as DerivativeErrorCode
    const message = sanitizeDerivativeErrorMessage(
      error instanceof Error ? error.message : String((error as any).message ?? code),
      storageRootDir
    )
    return { code, message }
  }
  return {
    code: 'derivative_input_missing',
    message: sanitizeDerivativeErrorMessage(
      error instanceof Error ? error.message : `Derivative job ${job.id} failed.`,
      storageRootDir
    ),
  }
}

function mapProviderRequestError(
  error: unknown,
  input: Readonly<{
    jobId: string
    assetId: string
    derivativeKind: string
    fallbackCode: DerivativeErrorCode
  }>
): Error {
  if (isAbortTimeoutError(error)) {
    const message = error instanceof Error ? error.message : 'Derivative provider request timed out.'
    return derivativeError('derivative_task_timeout', input.jobId, input.assetId, input.derivativeKind, message)
  }
  const message = error instanceof Error ? error.message : `${input.fallbackCode} request failed.`
  return derivativeError(input.fallbackCode, input.jobId, input.assetId, input.derivativeKind, message)
}

function isAbortTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = String((error as any).name ?? '').trim().toLowerCase()
  const message = String((error as any).message ?? '').trim().toLowerCase()
  return name === 'aborterror' || message.includes('aborted') || message.includes('timeout')
}

function isPdfAnnotationJob(job: DerivativeJobRecord): boolean {
  return job.configJson?.source === 'pdf_annotation' || job.inputSnapshotJson?.source === 'pdf_annotation'
}

function readNumberMeta(meta: Record<string, unknown> | null, key: string): number | null {
  const value = meta?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringMeta(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function sanitizeDerivativeErrorMessage(message: string, storageRootDir: string): string {
  let output = String(message ?? '').trim()
  if (!output) return 'Derivative job failed.'
  const root = String(storageRootDir ?? '').trim()
  if (root) {
    output = output.split(root).join('[storage-root]')
  }
  output = output
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/gi, 'data:[redacted]')
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[redacted-base64]')
    .replace(/\b[A-Za-z]:\\[^\s'"`]+/g, '[redacted-path]')
    .replace(/\\\\[^\s'"`]+/g, '[redacted-path]')
  return output.length <= 800 ? output : `${output.slice(0, 800)}...`
}
