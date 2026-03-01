import type { AnyEventHandler, EventType, HandlerMap } from './reducerTypes'
import {
  handleMessageAppendContentBlock,
  handleMessageDeltaAnnotationBatch,
  handleMessageDeltaText,
  handleMessageDeltaToolCall,
} from './messageHandlers'
import {
  handleMessageDeltaReasoningDetail,
  handleMessageDeltaReasoningDetailBatch,
} from './reasoningHandlers'
import {
  handleMetaDelta,
  handleStreamAbort,
  handleStreamComment,
  handleStreamDone,
  handleStreamError,
  handleTimingSnapshot,
  handleUsageDelta,
} from './streamHandlers'

const handlersByType: HandlerMap = {
  StreamComment: handleStreamComment,
  MetaDelta: handleMetaDelta,
  UsageDelta: handleUsageDelta,
  TimingSnapshot: handleTimingSnapshot,
  MessageDeltaText: handleMessageDeltaText,
  MessageAppendContentBlock: handleMessageAppendContentBlock,
  MessageDeltaToolCall: handleMessageDeltaToolCall,
  MessageDeltaAnnotationBatch: handleMessageDeltaAnnotationBatch,
  MessageDeltaReasoningDetail: handleMessageDeltaReasoningDetail,
  MessageDeltaReasoningDetailBatch: handleMessageDeltaReasoningDetailBatch,
  StreamAbort: handleStreamAbort,
  StreamError: handleStreamError,
  StreamDone: handleStreamDone,
}

export const handlers: Record<EventType, AnyEventHandler> = handlersByType as unknown as Record<EventType, AnyEventHandler>
