export type TextChunk = Readonly<{
  chunkIndex: number
  text: string
  start: number
  end: number
}>

export function chunkTextForEmbeddings(
  text: string,
  options?: Readonly<{
    maxChars?: number
  }>
): TextChunk[] {
  const normalized = String(text ?? '')
  const trimmed = normalized.trim()
  if (!trimmed) return []

  const maxChars = Math.max(256, Math.floor(options?.maxChars ?? 2000))
  const chunks: TextChunk[] = []
  let chunkIndex = 0

  const paragraphs = splitParagraphs(normalized)
  let pendingText = ''
  let pendingStart = 0

  for (const paragraph of paragraphs) {
    const paragraphText = normalized.slice(paragraph.start, paragraph.end)
    if (!paragraphText.trim()) continue
    if (!pendingText) {
      pendingText = paragraphText
      pendingStart = paragraph.start
      continue
    }

    if ((pendingText + '\n\n' + paragraphText).length <= maxChars) {
      pendingText += '\n\n' + paragraphText
      continue
    }

    pushChunk()
    pendingText = paragraphText
    pendingStart = paragraph.start
  }

  if (pendingText) pushChunk()
  return chunks

  function pushChunk() {
    const normalizedText = pendingText.trim()
    if (!normalizedText) {
      pendingText = ''
      return
    }
    if (normalizedText.length <= maxChars) {
      const start = findStart(normalized, normalizedText, pendingStart)
      const end = start + normalizedText.length
      chunks.push({ chunkIndex, text: normalizedText, start, end })
      chunkIndex += 1
      pendingText = ''
      return
    }

    const segments = splitOversizedText(normalizedText, maxChars)
    let segmentStartSearch = pendingStart
    for (const segment of segments) {
      const start = findStart(normalized, segment, segmentStartSearch)
      const end = start + segment.length
      chunks.push({ chunkIndex, text: segment, start, end })
      chunkIndex += 1
      segmentStartSearch = end
    }
    pendingText = ''
  }
}

function splitParagraphs(text: string): Array<Readonly<{ start: number; end: number }>> {
  const ranges: Array<Readonly<{ start: number; end: number }>> = []
  const regex = /\n\s*\n/g
  let start = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    ranges.push({ start, end: match.index })
    start = match.index + match[0].length
  }
  ranges.push({ start, end: text.length })
  return ranges
}

function splitOversizedText(text: string, maxChars: number): string[] {
  const out: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars)
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end)
      if (boundary > start + Math.floor(maxChars / 2)) {
        end = boundary
      }
    }
    out.push(text.slice(start, end).trim())
    start = end
    while (start < text.length && /\s/.test(text[start] ?? '')) start += 1
  }
  return out.filter(Boolean)
}

function findStart(haystack: string, needle: string, from: number): number {
  const found = haystack.indexOf(needle, Math.max(0, from))
  if (found >= 0) return found
  return Math.max(0, from)
}
