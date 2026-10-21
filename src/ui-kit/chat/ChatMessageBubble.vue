<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ErrorPanelViewModel, MessageVM } from './types'
import ChatErrorPanel from './ChatErrorPanel.vue'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import RichTextContent from './richtext/RichTextContent.vue'
import RichTextFinal from './richtext/RichTextFinal.vue'
import { sanitizeGoogleSearchSuggestions } from './googleSearchSuggestionsSanitizer'
import './richtext/richtext.css'
import { t, tf } from '@/shared/i18n'

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
  persisted: boolean
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
    out.push({ index: i, url: block.url, persisted: Boolean(block.assetRevisionId) })
  }
  return out
})

const otherBlocks = computed(() =>
  props.message.contentBlocks.filter((block) => block.type !== 'text' && block.type !== 'image')
)

const searchSuggestions = computed(() => (props.message.googleSearchSuggestions ?? []).map((value) => ({
  raw: value,
  ...sanitizeGoogleSearchSuggestions(value),
})))

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

function isTransientDataImageUrl(url: string): boolean {
  return String(url ?? '').trim().toLowerCase().startsWith('data:')
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
      return 'bg-[var(--sv-selected)] px-4 py-2.5 text-[var(--sv-text)]'
    case 'tool':
      return 'border border-[var(--sv-line)] px-3 py-2 text-[var(--sv-text)]'
    case 'assistant':
    default:
      return 'text-[var(--sv-text)]'
  }
}
</script>

<template>
  <div class="flex" :data-role="props.message.role" :class="isUser ? 'justify-end' : 'justify-start'">
    <div class="min-w-0" :class="isUser ? 'max-w-[85%]' : 'w-full'">
      <div class="rounded-2xl text-sm" :class="bubbleClass(props.message.role)">
        <div :class="isTool ? 'mb-1.5 flex items-center justify-between gap-2' : 'sr-only'">
          <div :class="isTool ? 'sv-label' : ''">
            {{ isUser ? t('chat.message.role.user') : isTool ? t('chat.message.role.tool') : t('chat.message.role.assistant') }}
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <slot name="before-content" />

          <div v-for="(b, idx) in textBlocks" :key="`text-${idx}`">
            <template v-if="b.type === 'text'">
              <pre
                v-if="isTool"
                class="whitespace-pre-wrap break-words rounded-md bg-[var(--sv-sunken)] p-2 text-xs"
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
              <div v-else class="whitespace-pre-wrap break-words leading-relaxed">{{ b.text }}</div>
            </template>
          </div>

          <div
            v-if="imageBlocks.length > 0"
            class="text-xs text-[var(--sv-text-2)]"
            data-testid="message-image-section"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="sv-label">{{ t('common.images') }} ({{ imageBlocks.length }})</div>
              <div
                v-if="isAssistant && !props.message.streaming.isComplete"
                class="sv-meta"
              >
                {{ t('common.streaming') }}
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
                  class="block w-full overflow-hidden rounded-xl border border-[var(--sv-line)] bg-white"
                  :data-testid="`message-image-preview-open-${image.index}`"
                  @click="openPreview(image.url, image.index)"
                >
                  <img
                    class="h-48 w-full bg-white object-contain"
                    :src="image.url"
                    :alt="tf('chat.message.imageAlt', { index: image.index + 1 })"
                  />
                </button>
                <div class="mt-1 flex min-h-4 flex-wrap gap-1">
                  <span
                    v-if="!image.persisted && isTransientDataImageUrl(image.url)"
                    class="sv-meta"
                    :data-testid="`message-image-persisting-${image.index}`"
                  >
                    {{ t('chat.message.persisting') }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="showImagePlaceholder"
            class="flex h-48 items-center justify-center rounded-xl border border-dashed border-[var(--sv-line-strong)] text-xs text-[var(--sv-text-3)]"
            data-testid="message-image-placeholder"
          >
            {{ t('chat.message.imageGenerating') }}
          </div>

          <div v-for="(b, idx) in otherBlocks" :key="`other-${idx}`">
            <div class="rounded-md bg-[var(--sv-sunken)] p-2">
              <pre class="whitespace-pre-wrap text-xs">{{ JSON.stringify(b, null, 2) }}</pre>
            </div>
          </div>

          <div
            v-if="isAssistant && searchSuggestions.length > 0"
            class="border-l border-[var(--sv-line-strong)] pl-3"
            data-testid="google-search-suggestions"
          >
            <div class="sv-label">
              {{ t('chat.message.googleSearchSuggestions') }}
            </div>
            <div
              v-for="(suggestion, idx) in searchSuggestions"
              :key="`google-search-suggestion-${idx}`"
              class="mt-2 text-xs text-[var(--sv-text-2)]"
            >
              <div v-if="suggestion.html" v-html="suggestion.html" />
              <pre v-else class="whitespace-pre-wrap">{{ suggestion.plainText || suggestion.raw }}</pre>
              <div v-if="suggestion.removed" class="mt-1 text-xs text-[var(--sv-warning)]">
                {{ t('chat.message.googleSearchSuggestionsFiltered') }}
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="isAssistant && citations.length > 0"
          class="mt-4"
        >
          <div class="sv-label">
            {{ t('common.references') }} ({{ citations.length }})
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <a
              v-for="item in citations"
              :key="`jump-${item.key}`"
              class="sv-chip hover:bg-[var(--sv-selected)] hover:text-[var(--sv-text)]"
              :href="`#${item.id}`"
            >
              [{{ item.rank }}]
              <template v-if="item.startIndex !== undefined && item.endIndex !== undefined">
                @{{ item.startIndex }}-{{ item.endIndex }}
              </template>
            </a>
          </div>
          <ol class="mt-3 flex flex-col gap-2">
            <li
              v-for="item in citations"
              :id="item.id"
              :key="item.key"
              class="text-xs text-[var(--sv-text-2)]"
            >
              <div class="flex items-start gap-2">
                <span class="font-mono text-xs text-[var(--sv-text-3)]">[{{ item.rank }}]</span>
                <a
                  v-if="item.url"
                  class="min-w-0 break-all text-[var(--sv-text)] underline decoration-black/30 underline-offset-2 hover:decoration-current"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ item.title || item.domain || item.url }}
                </a>
                <span v-else class="min-w-0 break-all text-[var(--sv-text-2)]">
                  {{ item.title || item.domain || t('chat.message.untitledSource') }}
                </span>
                <span
                  v-if="item.startIndex !== undefined && item.endIndex !== undefined"
                  class="sv-meta ml-auto shrink-0 font-mono"
                >
                  {{ item.startIndex }}-{{ item.endIndex }}
                </span>
              </div>
              <div v-if="item.excerpt" class="mt-1 whitespace-pre-wrap break-words pl-7 text-xs text-[var(--sv-text-3)]">
                {{ item.excerpt }}
              </div>
            </li>
          </ol>
        </div>

        <div v-if="props.message.toolCalls.length" class="mt-4 flex flex-col gap-2">
          <div class="sv-label">
            {{ t('common.toolCalls') }} ({{ props.message.toolCalls.length }})
          </div>

          <details
            v-for="tc in props.message.toolCalls"
            :key="tc.index"
            class="group/tool border-l border-[var(--sv-line-strong)] pl-3"
            :open="props.message.toolCalls.length === 1"
          >
            <summary class="flex cursor-pointer select-none items-center gap-1 [&::-webkit-details-marker]:hidden text-xs text-[var(--sv-text-2)]">
              <span class="inline-flex h-3.5 w-3.5 flex-none items-center justify-center transition-transform group-open/tool:rotate-90"><UiIcon name="chevronRight" :size="14" /></span>
              <span class="font-mono">#{{ tc.index }}</span>
              <span class="ml-1 font-medium text-[var(--sv-text)]">{{ tc.name || `(${t('chat.message.unknownTool')})` }}</span>
              <span v-if="tc.id" class="ml-1 font-mono text-xs text-[var(--sv-text-3)]">{{ tc.id }}</span>
            </summary>

            <div class="mt-2 flex flex-col gap-2 text-xs text-[var(--sv-text-2)]">
              <div v-if="tc.type">
                {{ t('chat.message.type') }}: <span class="font-mono">{{ tc.type }}</span>
              </div>
              <div>
                <div class="sv-label mb-1">{{ t('chat.message.arguments') }}</div>
                <pre class="whitespace-pre-wrap break-words rounded-md bg-[var(--sv-sunken)] p-2 text-xs">{{ tc.argumentsText }}</pre>
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
          class="mt-3 rounded-md bg-[var(--sv-sunken)] p-3 text-xs text-[var(--sv-text-2)]"
        >
          <div>id: <span class="font-mono">{{ props.message.messageId }}</span></div>
          <div>role: <span class="font-mono">{{ props.message.role }}</span></div>
          <div>streaming: <span class="font-mono">{{ JSON.stringify(props.message.streaming) }}</span></div>
        </div>

        <!-- Fixed-height status row, always reserved for assistant messages so the
             streaming indicator appearing or disappearing never moves the content. -->
        <div
          v-if="isAssistant || $slots['header-right']"
          class="mt-1 flex h-5 items-center gap-2 text-xs text-[var(--sv-text-3)]"
        >
          <slot name="header-right" />
          <div v-if="showGenerating" class="flex items-center gap-1.5">
            {{ t('common.generating') }}<span class="sv-stream-caret" aria-hidden="true" />
          </div>
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
    <div class="max-h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-lg">
      <div class="flex items-center justify-between border-b border-[var(--sv-line)] px-3 py-2 text-xs text-[var(--sv-text-3)]">
        <div>{{ t('common.images') }} #{{ (previewImageIndex ?? 0) + 1 }}</div>
        <button
          type="button"
          class="sv-btn sv-btn-sm"
          data-testid="message-image-preview-close"
          @click="closePreview"
        >
          {{ t('common.closePreview') }}
        </button>
      </div>
      <div class="max-h-[80vh] overflow-auto bg-[var(--sv-sunken)] p-3">
        <img
          class="mx-auto h-auto max-h-[74vh] w-auto max-w-full rounded-md border border-[var(--sv-line)] bg-white object-contain"
          :src="previewImageUrl"
          :alt="t('chat.message.imagePreviewAlt')"
          data-testid="message-image-preview-image"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sv-stream-caret {
  display: inline-block;
  width: 6px;
  height: 12px;
  border-radius: 1px;
  background: currentColor;
  animation: sv-stream-caret-pulse 1s ease-in-out infinite;
}
@keyframes sv-stream-caret-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.9; }
}
@media (prefers-reduced-motion: reduce) {
  .sv-stream-caret { animation: none; opacity: 0.6; }
}
</style>
