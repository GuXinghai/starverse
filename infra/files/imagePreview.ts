import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

export type PreviewOutputFormat = 'jpeg' | 'png'

export type GeneratedImagePreview = Readonly<{
  sourceWidth: number
  sourceHeight: number
  previewWidth: number
  previewHeight: number
  outputMime: string
  outputFormat: PreviewOutputFormat
  bytes: Uint8Array
}>

type DecodedImage = Readonly<{
  width: number
  height: number
  rgba: Uint8Array
}>

export function generateImagePreview(
  sourceBytes: Uint8Array,
  sourceMime: string | null,
  maxEdge: number
): GeneratedImagePreview {
  const normalizedMime = normalizeImageMime(sourceMime)
  if (!normalizedMime) {
    throw new Error('preview_source_not_supported')
  }
  const boundedMaxEdge = Math.max(64, Math.floor(Number(maxEdge) || 0))
  const decoded = decodeImage(sourceBytes, normalizedMime)
  if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width <= 0 || decoded.height <= 0) {
    throw new Error('preview_output_invalid')
  }

  const scale = Math.min(1, boundedMaxEdge / Math.max(decoded.width, decoded.height))
  const previewWidth = Math.max(1, Math.round(decoded.width * scale))
  const previewHeight = Math.max(1, Math.round(decoded.height * scale))
  const previewRgba =
    previewWidth === decoded.width && previewHeight === decoded.height
      ? decoded.rgba
      : resizeNearest(decoded.rgba, decoded.width, decoded.height, previewWidth, previewHeight)

  if (normalizedMime === 'image/png') {
    const bytes = PNG.sync.write({
      width: previewWidth,
      height: previewHeight,
      data: Buffer.from(previewRgba),
    })
    return {
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      previewWidth,
      previewHeight,
      outputMime: 'image/png',
      outputFormat: 'png',
      bytes: new Uint8Array(bytes),
    }
  }

  const encoded = jpeg.encode(
    {
      width: previewWidth,
      height: previewHeight,
      data: Buffer.from(previewRgba),
    },
    82
  )
  return {
    sourceWidth: decoded.width,
    sourceHeight: decoded.height,
    previewWidth,
    previewHeight,
    outputMime: 'image/jpeg',
    outputFormat: 'jpeg',
    bytes: new Uint8Array(encoded.data),
  }
}

export function normalizeImageMime(mime: string | null): 'image/png' | 'image/jpeg' | null {
  const normalized = String(mime ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (normalized === 'image/png') return 'image/png'
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg'
  return null
}

function decodeImage(bytes: Uint8Array, mime: 'image/png' | 'image/jpeg'): DecodedImage {
  if (mime === 'image/png') {
    const decoded = PNG.sync.read(Buffer.from(bytes))
    return {
      width: decoded.width,
      height: decoded.height,
      rgba: new Uint8Array(decoded.data),
    }
  }
  const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true })
  return {
    width: decoded.width,
    height: decoded.height,
    rgba: new Uint8Array(decoded.data),
  }
}

function resizeNearest(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Uint8Array {
  const out = new Uint8Array(targetWidth * targetHeight * 4)
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight))
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth))
      const srcOffset = (srcY * sourceWidth + srcX) * 4
      const dstOffset = (y * targetWidth + x) * 4
      out[dstOffset] = rgba[srcOffset] ?? 0
      out[dstOffset + 1] = rgba[srcOffset + 1] ?? 0
      out[dstOffset + 2] = rgba[srcOffset + 2] ?? 0
      out[dstOffset + 3] = rgba[srcOffset + 3] ?? 255
    }
  }
  return out
}
