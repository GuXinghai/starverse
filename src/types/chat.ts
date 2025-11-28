/**
 * 多模态消息系统 - 核心类型定义
 * 
 * 这个文件定义了 Starverse 的消息结构，支持文本和图像等多种内容类型。
 * 遵循行业标准 API 格式（如 OpenAI、Google Gemini）。
 */

/**
 * 文本内容部分
 */
export type TextPart = {
  type: 'text';
  id?: string;
  text: string;
};

/**
 * 图像内容部分
 * 图像使用 base64 data URI 格式存储
 */
export type ImagePart = {
  id?: string;
  type: 'image_url';
  image_url: {
    url: string; // base64 data URI: "data:image/jpeg;base64,..."
  };
};

/**
 * 消息内容部分的联合类型
 * 未来可扩展更多类型：audio, video, file 等
 */
export type MessagePart = TextPart | ImagePart;

/**
 * 网络搜索挡位
 */
export type WebSearchLevel = 'quick' | 'normal' | 'deep';

/**
 * 推理挡位（Reasoning Effort）
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * 推理可见性选项
 * visible: 请求并返回推理轨迹
 * hidden: 请求推理但不返回（exclude=true）
 * off: 不启用推理参数
 */
export type ReasoningVisibility = 'visible' | 'hidden' | 'off';

/**
 * 推理请求负载，映射 OpenRouter reasoning 参数
 */
export interface ReasoningRequestPayload {
  enabled?: boolean;
  effort?: ReasoningEffort;
  max_tokens?: number;
  exclude?: boolean;
}

/**
 * 会话级推理偏好配置
 */
export interface ReasoningPreference {
  visibility: ReasoningVisibility;
  effort: ReasoningEffort;
  maxTokens?: number | null;
}

/**
 * 璇锋眰閲忔嘲鍙傛暟閰嶇疆锛岀敤浜庢嫤鎴劧鏂簨鐗岀瓥鐣ヨ缃�
 */
export interface SamplingParameterSettings {
  enabled: boolean;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
  repetition_penalty?: number | null;
  min_p?: number | null;
  top_a?: number | null;
  max_tokens?: number | null;
  seed?: number | null;
}

export const DEFAULT_SAMPLING_PARAMETERS: Readonly<SamplingParameterSettings> = Object.freeze({
  enabled: false,
  temperature: 1,
  top_p: 1,
  top_k: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  repetition_penalty: 1,
  min_p: 0,
  top_a: 0,
  max_tokens: null,
  seed: null
})

/**
 * 单条推理详情（reasoning_details 项）
 */
export interface ReasoningDetail {
  id?: string | null;
  type: string;
  format?: string;
  index?: number;
  text?: string;
  summary?: string;
  data?: string;
  signature?: string | null;
  [key: string]: any;
}

/**
 * 消息推理元数据（用于展示与再利用）
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 字段说明：
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * streamText?: 实时展示文本（来自 delta.reasoning）
 *   - 用途：UI 展示层，流式过程中实时显示思考过程
 *   - 来源：OpenRouter 的 delta.reasoning 字段
 *   - 保存：不保存到磁盘，仅用于当前会话的临时显示
 * 
 * text?: 完整推理文本（来自 reasoning_summary）
 *   - 用途：最终完整文本，流结束后显示
 *   - 来源：OpenRouter 流结束时的 reasoning_summary.text
 *   - 保存：保存到磁盘，用于历史记录查看
 * 
 * details?: 结构化推理块数组（来自 reasoning_details）
 *   - 用途：回传给模型，保持思考连续性（工具调用/多轮对话必需）
 *   - 来源：OpenRouter 的 reasoning_details 数组
 *   - 保存：保存到磁盘，下次请求时原样回传给模型
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
export interface MessageReasoningMetadata {
  streamText?: string;  // 🎨 流式展示文本（临时，不保存）
  text?: string;        // 📝 完整文本（最终，保存）
  summary?: string;
  details?: ReasoningDetail[];        // 🔄 结构化块（回传模型，保存）
  rawDetails?: Array<Record<string, any>>;
  excluded?: boolean;
  request?: {
    visibility: ReasoningVisibility;
    effort: ReasoningEffort;
    maxTokens?: number | null;
    payload: ReasoningRequestPayload;
  };
  provider?: string;
  model?: string;
  lastUpdatedAt?: number;
}

/**
 * 消息版本的附加元数据
 * 用于记录错误状态、错误类型等信息，帮助 UI 在重新生成时做出针对性的处理。
 */
export interface MessageVersionMetadata {
  isError?: boolean;
  errorCode?: string;
  errorType?: string;
  errorMessage?: string;
  errorParam?: string;
  errorStatus?: number;
  retryable?: boolean;
  usage?: UsageMetrics;
  reasoning?: MessageReasoningMetadata;
}

export interface UsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  costDetails?: Record<string, number>;
  raw?: Record<string, any>;
}

/**
 * 消息接口（保留用于向后兼容）
 * 每条消息由一个或多个 parts 组成
 */
export interface Message {
  id: string;
  role: 'user' | 'model';
  parts: MessagePart[];
  timestamp?: number; // 可选的时间戳
}

/**
 * ========== 消息分支树结构 ==========
 * 支持消息版本管理和分支对话
 */

/**
 * 消息版本 - 同一分支的不同版本
 * 例如：重新生成的不同回复，或编辑后的不同提问
 */
export interface MessageVersion {
  id: string;                    // 版本唯一ID
  parts: MessagePart[];          // 消息内容（支持多模态）
  timestamp: number;             // 创建时间
  childBranchIds: string[];      // 子分支ID列表（版本级后继关系）
  metadata?: MessageVersionMetadata; // 附加的版本元数据（错误信息等）
}

/**
 * 消息分支 - 对话树中的一个节点
 * 
 * 树状结构示例：
 * 
 *   [用户提问A] (branchId: b1, 1个版本)
 *        ↓
 *   [AI回复B] (branchId: b2, 3个版本: B1, B2, B3)
 *        ↓
 *   [用户提问C] (branchId: b3, 2个版本: C1, C2)
 *        ↓
 *   [AI回复D] (branchId: b4, 1个版本)
 * 
 * currentPath = [b1, b2, b3, b4]
 * 当前显示路径：A → B2 → C1 → D
 */
export interface MessageBranch {
  branchId: string;              // 分支唯一ID
  role: 'user' | 'model';        // 消息角色
  parentBranchId: string | null; // 父分支ID（null表示根节点）
  parentVersionId: string | null;// 源自父分支的哪个版本ID
  versions: MessageVersion[];    // 该分支的所有版本
  currentVersionIndex: number;   // 当前显示的版本索引 (0-based)
}

/**
 * 对话树结构
 * 管理整个对话的分支和版本
 */
export interface ConversationTree {
  branches: Map<string, MessageBranch>;  // 所有分支的Map集合
  rootBranchIds: string[];               // 根分支ID列表（对话开始的消息）
  currentPath: string[];                 // 当前显示路径的分支ID数组
}

/**
 * 对话接口（更新版）
 */
export interface Conversation {
  id: string;
  title: string;
  tree: ConversationTree;        // 树形消息结构
  model: string;                 // 使用的模型
  generationStatus: 'idle' | 'sending' | 'receiving'; // 生成状态：idle=空闲, sending=发送中, receiving=接收中
  draft: string;                 // 草稿内容
  createdAt?: number;
  updatedAt?: number;
  webSearchEnabled?: boolean;
  webSearchLevel?: WebSearchLevel;
  reasoningPreference?: ReasoningPreference;
  samplingParameters?: SamplingParameterSettings;
}

/**
 * 工具函数：创建纯文本消息
 */
export function createTextMessage(role: 'user' | 'model', text: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: 'text', text }],
    timestamp: Date.now()
  };
}

/**
 * 工具函数：从消息中提取纯文本内容
 * 用于向后兼容和显示
 */
export function extractTextFromMessage(message: Message): string {
  return message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

/**
 * 工具函数：检查消息是否包含图像
 */
export function hasImageContent(message: Message): boolean {
  return message.parts.some(part => part.type === 'image_url');
}

/**
 * 工具函数：获取消息中的所有图像 URL
 */
export function getImageUrls(message: Message): string[] {
  return message.parts
    .filter((part): part is ImagePart => part.type === 'image_url')
    .map(part => part.image_url.url);
}

/**
 * ========== 注意 ==========
 * 树操作工具函数位于 stores/branchTreeHelpers.ts
 * 包括: createEmptyTree, getCurrentVersion, addBranch, switchVersion 等
 */
