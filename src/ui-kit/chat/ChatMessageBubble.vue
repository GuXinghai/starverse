<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ErrorPanelViewModel, MessageVM } from './types'
import ChatErrorPanel from './ChatErrorPanel.vue'
import RichTextContent from './richtext/RichTextContent.vue'
import RichTextFinal from './richtext/RichTextFinal.vue'
import './richtext/richtext.css'

const props = withDefaults(
  defineProps<{
    message: MessageVM
    renderUserMessageRichText?: boolean
    showDebug?: boolean
    errorEnvelopeLoading?: boolean
    errorEnvelopeUnavailable?: boolean
    errorView?: ErrorPanelViewModel | null
    onRequestErrorEnvelope?: (messageId: string) => void
  }>(),
  {
    renderUserMessageRichText: false,
    showDebug: false,
    errorEnvelopeLoading: false,
    errorEnvelopeUnavailable: false,
    errorView: null,
  },
)

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const isTool = computed(() => props.message.role === 'tool')

const showGenerating = computed(
  () => isAssistant.value && props.message.streaming.isTarget && !props.message.streaming.isComplete,
)

type ImageBlockItem = Readonly<{
  index: number
  url: string
}>

const textBlocks = computed(() =>
  props.message.contentBlocks
    .filter((block): block is Readonly<{ type: 'text'; text: string }> => block.type === 'text')
)

const imageBlocks = computed<ImageBlockItem[]>(() => {
  const out: ImageBlockItem[] = []
  for (let i = 0; i < props.message.contentBlocks.length; i += 1) {
    const block = props.message.contentBlocks[i]
    if (block.type !== 'image') continue
    out.push({ index: i, url: block.url })
  }
  return out
})

const otherBlocks = computed(() =>
  props.message.contentBlocks.filter((block) => block.type !== 'text' && block.type !== 'image')
)

const showImagePlaceholder = computed(
  () =>
    isAssistant.value &&
    props.message.streaming.isTarget &&
    !props.message.streaming.isComplete &&
    props.message.requestedImageGeneration === true &&
    imageBlocks.value.length === 0,
)

const previewImageUrl = ref<string | null>(null)
const previewImageIndex = ref<number | null>(null)

function getElectronApi():
  | {
      copyImageToClipboard?: (imageUrl: string) => Promise<{ success?: boolean } | null>
      resolveImagePath?: (imageUrl: string) => Promise<{ success?: boolean; path?: string } | null>
      exportImage?: (
        imageUrl: string,
        options?: Readonly<{ suggestedName?: string }>
      ) => Promise<{ success?: boolean } | null>
    }
  | null {
  const api = (globalThis as any)?.electronAPI
  if (!api || typeof api !== 'object') return null
  return api
}

function getIpcRenderer(): { invoke?: (channel: string, payload?: unknown) => Promise<unknown> } | null {
  const ipc = (globalThis as any)?.ipcRenderer
  if (!ipc || typeof ipc !== 'object') return null
  return ipc
}

function sanitizeFileName(raw: string): string {
  const normalized = String(raw ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized.slice(0, 80) : 'image'
}

function inferExtensionFromMime(mime: string | null | undefined): string {
  const normalized = String(mime ?? '').trim().toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/gif') return 'gif'
  if (normalized === 'image/bmp') return 'bmp'
  if (normalized === 'image/svg+xml') return 'svg'
  return 'png'
}

function inferExtensionFromUrl(url: string): string {
  const trimmed = String(url ?? '').trim()
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  if (dataUrlMatch?.[1]) return inferExtensionFromMime(dataUrlMatch[1])
  try {
    const parsed = new URL(trimmed)
    const ext = parsed.pathname.split('.').pop()?.toLowerCase()
    if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 6) return ext
  } catch {
    const ext = trimmed.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase()
    if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 6) return ext
  }
  return 'png'
}

function inferSuggestedName(index: number, url: string): string {
  const base = sanitizeFileName(`assistant-image-${index + 1}`)
  const ext = inferExtensionFromUrl(url)
  return `${base}.${ext}`
}

function isTransientDataImageUrl(url: string): boolean {
  return String(url ?? '').trim().toLowerCase().startsWith('data:')
}

async function writeClipboardText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // no-op
  }
}

async function copyImageToClipboard(url: string) {
  if (isTransientDataImageUrl(url)) return
  const electronApi = getElectronApi()
  if (electronApi?.copyImageToClipboard) {
    const result = await electronApi.copyImageToClipboard(url)
    if (result?.success === true) return
  }
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer?.invoke) {
    try {
      const result = (await ipcRenderer.invoke('clipboard:write-image', { imageUrl: url })) as
        | { success?: boolean }
        | null
      if (result?.success === true) return
    } catch {
      // no-op
    }
  }

  // Browser fallback: copy URL text when image clipboard API is unavailable.
  await writeClipboardText(url)
}

function tryDecodeFileUrlToPath(url: string): string | null {
  if (!url.startsWith('file://')) return null
  try {
    const parsed = new URL(url)
    const decoded = decodeURIComponent(parsed.pathname)
    if (decoded.startsWith('/') && /^[a-zA-Z]:/.test(decoded.slice(1))) {
      return decoded.slice(1)
    }
    return decoded
  } catch {
    return null
  }
}

async function resolveImagePath(url: string): Promise<string> {
  const localPath = tryDecodeFileUrlToPath(url)
  if (localPath) return localPath
  if (!url.startsWith('asset://')) return url

  const electronApi = getElectronApi()
  if (electronApi?.resolveImagePath) {
    const result = await electronApi.resolveImagePath(url)
    if (result?.success && typeof result.path === 'string' && result.path.trim().length > 0) {
      return result.path.trim()
    }
  }
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer?.invoke) {
    try {
      const result = (await ipcRenderer.invoke('shell:resolve-image-path', { imageUrl: url })) as
        | { success?: boolean; path?: string }
        | null
      if (result?.success && typeof result.path === 'string' && result.path.trim().length > 0) {
        return result.path.trim()
      }
    } catch {
      // no-op
    }
  }
  return url
}

async function copyImagePath(url: string) {
  if (isTransientDataImageUrl(url)) return
  const resolvedPath = await resolveImagePath(url)
  await writeClipboardText(resolvedPath)
}

async function exportImage(url: string, index: number) {
  if (isTransientDataImageUrl(url)) return
  const suggestedName = inferSuggestedName(index, url)
  const electronApi = getElectronApi()
  if (electronApi?.exportImage) {
    const result = await electronApi.exportImage(url, { suggestedName })
    if (result?.success === true) return
  }

  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer?.invoke) {
    try {
      const result = (await ipcRenderer.invoke('dialog:export-image', {
        imageUrl: url,
        suggestedName,
      })) as { success?: boolean } | null
      if (result?.success === true) return
    } catch {
      // no-op
    }
  }

  // Browser fallback: trigger native download.
  try {
    const response = await fetch(url)
    if (!response.ok) return
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    // no-op
  }
}

function openPreview(url: string, index: number) {
  previewImageUrl.value = url
  previewImageIndex.value = index
}

function closePreview() {
  previewImageUrl.value = null
  previewImageIndex.value = null
}

function onPreviewBackdropClick(event: MouseEvent) {
  if (event.target !== event.currentTarget) return
  closePreview()
}

type UrlCitationItem = Readonly<{
  key: string
  id: string
  rank: number
  url?: string
  title?: string
  domain?: string
  startIndex?: number
  endIndex?: number
  excerpt?: string
}>

const messageText = computed(() => {
  const parts: string[] = []
  for (const block of props.message.contentBlocks) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('')
})

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text.length > 0 ? text : undefined
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized >= 0 ? normalized : undefined
}

function toDomain(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function sliceCitationExcerpt(text: string, startIndex?: number, endIndex?: number): string | undefined {
  if (startIndex === undefined || endIndex === undefined) return undefined
  if (endIndex <= startIndex) return undefined
  if (startIndex >= text.length) return undefined
  const end = Math.min(text.length, endIndex)
  if (end <= startIndex) return undefined
  const excerpt = text.slice(startIndex, end).trim()
  return excerpt.length > 0 ? excerpt : undefined
}

const citations = computed<UrlCitationItem[]>(() => {
  const annotations = Array.isArray(props.message.annotations) ? props.message.annotations : []
  const text = messageText.value
  const out: UrlCitationItem[] = []
  const seen = new Set<string>()

  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue
    const ann = annotation as Record<string, unknown>
    if (ann.type !== 'url_citation') continue
    const citation = ann.url_citation && typeof ann.url_citation === 'object'
      ? (ann.url_citation as Record<string, unknown>)
      : null
    if (!citation) continue

    const url = toTrimmedString(citation.url)
    const title = toTrimmedString(citation.title)
    const startIndex = toNonNegativeInt(citation.start_index)
    const endIndex = toNonNegativeInt(citation.end_index)
    const contentFallback = toTrimmedString(citation.content)
    const excerpt =
      sliceCitationExcerpt(text, startIndex, endIndex) ??
      (contentFallback ? contentFallback.slice(0, 160) : undefined)
    const domain = toDomain(url)
    const key = `${url ?? ''}|${title ?? ''}|${startIndex ?? ''}|${endIndex ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)

    const rank = out.length + 1
    out.push({
      key,
      rank,
      id: `${props.message.messageId}-citation-${rank}`,
      url,
      title,
      domain,
      startIndex,
      endIndex,
      excerpt,
    })
  }

  return out
})

function bubbleClass(role: MessageVM['role']) {
  switch (role) {
    case 'user':
      return 'bg-blue-600 text-white shadow-sm'
    case 'assistant':
      return 'bg-white text-gray-900 ring-1 ring-gray-200 shadow-sm'
    case 'tool':
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 shadow-sm'
    default:
      return 'bg-white text-gray-900 ring-1 ring-gray-200 shadow-sm'
  }
}
</script>

<template>
  <div class="flex gap-3" :class="isUser ? 'justify-end' : 'justify-start'">
    <div v-if="!isUser" class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200">
      <span class="text-[11px] font-semibold text-gray-600">{{ isTool ? 'T' : 'A' }}</span>
    </div>

    <div class="w-full max-w-[80%]" :class="isUser ? 'max-w-[85%]' : 'max-w-[80%]'">
      <div class="rounded-2xl px-4 py-3 text-sm" :class="bubbleClass(props.message.role)">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {{ isUser ? 'You' : isTool ? 'Tool' : 'Assistant' }}
          </div>
          <div class="flex items-center gap-2">
            <slot name="header-right" />
            <div v-if="showGenerating" class="text-[11px] font-medium text-blue-700">
              正在生成<span class="font-mono">▍</span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="(b, idx) in textBlocks" :key="`text-${idx}`">
            <template v-if="b.type === 'text'">
              <pre
                v-if="isTool"
                class="whitespace-pre-wrap break-words rounded border border-black/10 bg-black/5 p-2 text-[11px]"
              >{{ b.text }}</pre>
              <RichTextContent
                v-else-if="isAssistant && !props.message.streaming.isComplete"
                :text="b.text"
                :streaming="true"
              />
              <RichTextFinal
                v-else-if="isAssistant"
                :text="b.text"
              />
              <RichTextFinal
                v-else-if="isUser && props.renderUserMessageRichText"
                :text="b.text"
              />
              <div v-else class="whitespace-pre-wrap break-words">{{ b.text }}</div>
            </template>
          </div>

          <div
            v-if="imageBlocks.length > 0"
            class="rounded-lg border border-black/10 bg-white/70 p-3 text-xs text-gray-700"
            data-testid="message-image-section"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="font-semibold">Images ({{ imageBlocks.length }})</div>
              <div
                v-if="isAssistant && !props.message.streaming.isComplete"
                class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700"
              >
                streaming
              </div>
            </div>

            <div
              :class="
                imageBlocks.length > 1
                  ? 'flex gap-3 overflow-x-auto pb-1'
                  : 'grid grid-cols-1 gap-3'
              "
              data-testid="message-image-gallery"
            >
              <div
                v-for="image in imageBlocks"
                :key="`image-${image.index}`"
                class="min-w-0"
                :class="imageBlocks.length > 1 ? 'w-[220px] shrink-0' : ''"
                :data-testid="`message-image-card-${image.index}`"
              >
                <button
                  type="button"
                  class="block w-full overflow-hidden rounded border border-black/10 bg-white"
                  :data-testid="`message-image-preview-open-${image.index}`"
                  @click="openPreview(image.url, image.index)"
                >
                  <img
                    class="h-48 w-full bg-white object-contain"
                    :src="image.url"
                    :alt="`image-${image.index + 1}`"
                  />
                </button>
                <div class="mt-1 flex flex-wrap gap-1">
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    :data-testid="`message-image-copy-${image.index}`"
                    :disabled="isTransientDataImageUrl(image.url)"
                    @click.stop="copyImageToClipboard(image.url)"
                  >
                    Copy image
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    :data-testid="`message-image-copy-path-${image.index}`"
                    :disabled="isTransientDataImageUrl(image.url)"
                    @click.stop="copyImagePath(image.url)"
                  >
                    Copy path
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    :data-testid="`message-image-export-${image.index}`"
                    :disabled="isTransientDataImageUrl(image.url)"
                    @click.stop="exportImage(image.url, image.index)"
                  >
                    Export
                  </button>
                  <span
                    v-if="isTransientDataImageUrl(image.url)"
                    class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700"
                    :data-testid="`message-image-persisting-${image.index}`"
                  >
                    Persisting...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="showImagePlaceholder"
            class="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-700"
            data-testid="message-image-placeholder"
          >
            Image is generating...
          </div>

          <div v-for="(b, idx) in otherBlocks" :key="`other-${idx}`">
            <div class="rounded-lg border border-black/10 bg-black/5 p-2">
              <pre class="whitespace-pre-wrap text-xs">{{ JSON.stringify(b, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <div
          v-if="isAssistant && citations.length > 0"
          class="mt-3 rounded-lg border border-gray-200 bg-white/70 p-3"
        >
          <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            References ({{ citations.length }})
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <a
              v-for="item in citations"
              :key="`jump-${item.key}`"
              class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
              :href="`#${item.id}`"
            >
              [{{ item.rank }}]
              <template v-if="item.startIndex !== undefined && item.endIndex !== undefined">
                @{{ item.startIndex }}-{{ item.endIndex }}
              </template>
            </a>
          </div>
          <ol class="mt-2 space-y-2">
            <li
              v-for="item in citations"
              :id="item.id"
              :key="item.key"
              class="rounded border border-gray-200 bg-white/80 p-2 text-xs text-gray-700"
            >
              <div class="flex items-start gap-2">
                <span class="font-mono text-[11px] text-gray-500">[{{ item.rank }}]</span>
                <a
                  v-if="item.url"
                  class="break-all text-blue-700 underline hover:text-blue-800"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ item.title || item.domain || item.url }}
                </a>
                <span v-else class="break-all text-gray-700">
                  {{ item.title || item.domain || 'Untitled source' }}
                </span>
                <span
                  v-if="item.startIndex !== undefined && item.endIndex !== undefined"
                  class="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500"
                >
                  {{ item.startIndex }}-{{ item.endIndex }}
                </span>
              </div>
              <div v-if="item.excerpt" class="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-600">
                {{ item.excerpt }}
              </div>
            </li>
          </ol>
        </div>

        <div v-if="props.message.toolCalls.length" class="mt-3 space-y-2">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            Tool calls ({{ props.message.toolCalls.length }})
          </div>

          <details
            v-for="tc in props.message.toolCalls"
            :key="tc.index"
            class="rounded-lg border border-black/10 bg-white/60 p-2"
            :open="props.message.toolCalls.length === 1"
          >
            <summary class="cursor-pointer select-none text-xs text-gray-800">
              <span class="font-mono">#{{ tc.index }}</span>
              <span class="ml-2 font-semibold">{{ tc.name || '(unknown)' }}</span>
              <span v-if="tc.id" class="ml-2 font-mono text-[11px] text-gray-500">{{ tc.id }}</span>
            </summary>

            <div class="mt-2 space-y-2 text-xs text-gray-700">
              <div v-if="tc.type">
                type: <span class="font-mono">{{ tc.type }}</span>
              </div>
              <div>
                <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">arguments</div>
                <pre class="whitespace-pre-wrap break-words rounded border border-black/10 bg-black/5 p-2 text-[11px]">{{ tc.argumentsText }}</pre>
              </div>
            </div>
          </details>
        </div>

        <ChatErrorPanel
          v-if="props.message.role === 'assistant' && props.errorView"
          :messageId="props.message.messageId"
          :errorView="props.errorView"
          :loading="props.errorEnvelopeLoading"
          :detailsUnavailable="props.errorEnvelopeUnavailable"
          :onRequestEnvelope="props.onRequestErrorEnvelope"
        />

        <div
          v-if="props.showDebug"
          class="mt-3 rounded-lg border border-black/10 bg-white/60 p-3 text-xs text-gray-700"
        >
          <div>id: <span class="font-mono">{{ props.message.messageId }}</span></div>
          <div>role: <span class="font-mono">{{ props.message.role }}</span></div>
          <div>streaming: <span class="font-mono">{{ JSON.stringify(props.message.streaming) }}</span></div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="previewImageUrl"
    class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
    data-testid="message-image-preview"
    @click="onPreviewBackdropClick"
  >
    <div class="max-h-full w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-600">
        <div>Image preview #{{ (previewImageIndex ?? 0) + 1 }}</div>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
          data-testid="message-image-preview-close"
          @click="closePreview"
        >
          Close
        </button>
      </div>
      <div class="max-h-[80vh] overflow-auto bg-gray-50 p-3">
        <img
          class="mx-auto h-auto max-h-[74vh] w-auto max-w-full rounded border border-gray-200 bg-white object-contain"
          :src="previewImageUrl"
          alt="preview"
          data-testid="message-image-preview-image"
        />
      </div>
    </div>
  </div>
</template>
