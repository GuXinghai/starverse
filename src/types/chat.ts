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
  text: string;
};

/**
 * 图像内容部分
 * 图像使用 base64 data URI 格式存储
 */
export type ImagePart = {
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
 * 消息接口
 * 每条消息由一个或多个 parts 组成
 */
export interface Message {
  id: string;
  role: 'user' | 'model';
  parts: MessagePart[];
  timestamp?: number; // 可选的时间戳
}

/**
 * 对话接口
 */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  modelName?: string;
  createdAt?: number;
  updatedAt?: number;
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
