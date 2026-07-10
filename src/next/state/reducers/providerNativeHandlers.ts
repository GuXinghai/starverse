import type { RootState } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import { updateMessage } from './stateUtils'
import { providerNativeChoiceIndex, providerNativeSnapshotKey } from '@/next/provider/providerNativeSnapshot'

export function handleMessageUpsertProviderNativeContent(
  ctx: HandlerContext,
  event: EventByType<'MessageUpsertProviderNativeContent'>,
): RootState {
  return updateMessage(ctx.state, event.messageId, (m) => {
    const prev = Array.isArray(m.providerNativeContents) ? m.providerNativeContents : []
    const index = prev.findIndex((item) =>
      item.providerKey === event.snapshot.providerKey &&
      item.sourceApi === event.snapshot.sourceApi &&
      providerNativeSnapshotKey(item) === providerNativeSnapshotKey(event.snapshot)
    )
    const next = index >= 0
      ? prev.map((item, currentIndex) => currentIndex === index ? event.snapshot : item)
      : [...prev, event.snapshot]
    next.sort((a, b) =>
      a.providerKey.localeCompare(b.providerKey) ||
      a.sourceApi.localeCompare(b.sourceApi) ||
      providerNativeSnapshotKey(a).localeCompare(providerNativeSnapshotKey(b)) ||
      providerNativeChoiceIndex(a) - providerNativeChoiceIndex(b)
    )
    return {
      ...m,
      providerNativeContents: next,
    }
  })
}
