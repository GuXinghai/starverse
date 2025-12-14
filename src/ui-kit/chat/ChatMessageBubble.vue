<script setup lang="ts">
import { computed } from 'vue'
import type { MessageVM } from './types'

const props = withDefaults(
  defineProps<{
    message: MessageVM
    showDebug?: boolean
  }>(),
  {
    showDebug: false,
  },
)

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const isTool = computed(() => props.message.role === 'tool')

const showGenerating = computed(
  () => isAssistant.value && props.message.streaming.isTarget && !props.message.streaming.isComplete,
)

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
          <div v-if="showGenerating" class="text-[11px] font-medium text-blue-700">
            正在生成<span class="font-mono">▍</span>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="(b, idx) in props.message.contentBlocks" :key="idx">
            <template v-if="b.type === 'text'">
              <pre
                v-if="isTool"
                class="whitespace-pre-wrap break-words rounded border border-black/10 bg-black/5 p-2 text-[11px]"
              >{{ b.text }}</pre>
              <div v-else class="whitespace-pre-wrap break-words">{{ b.text }}</div>
            </template>
            <template v-else-if="b.type === 'image'">
              <div class="rounded-lg border border-black/10 bg-white/70 p-3 text-xs text-gray-700">
                <div class="font-semibold">Image</div>
                <div class="mt-1 break-all font-mono opacity-80">{{ b.url }}</div>
              </div>
            </template>
            <template v-else>
              <div class="rounded-lg border border-black/10 bg-black/5 p-2">
                <pre class="whitespace-pre-wrap text-xs">{{ JSON.stringify(b, null, 2) }}</pre>
              </div>
            </template>
          </div>
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
</template>
