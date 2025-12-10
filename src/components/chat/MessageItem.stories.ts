import type { Meta, StoryObj } from '@storybook/vue3'
import MessageItem from './MessageItem.vue'
import type { MessageItemData } from './MessageItem.vue'
import type { MessagePart } from '@/types/chat'

// ============ Mock Data Factory ============

/**
 * 创建 Mock 消息的工厂函数
 * 简化 Story 编写，确保类型安全
 */
function createMockMessage(overrides: Partial<MessageItemData> = {}): MessageItemData {
  return {
    branchId: 'branch-1',
    role: 'user',
    parts: [],
    ...overrides
  }
}

/**
 * 创建文本 Part
 */
function createTextPart(text: string): MessagePart {
  return {
    type: 'text',
    id: `text-${Date.now()}`,
    text
  }
}

/**
 * 创建图片 Part
 */
function createImagePart(url: string): MessagePart {
  return {
    type: 'image_url',
    id: `image-${Date.now()}`,
    image_url: { url }
  }
}

/**
 * 创建文件 Part
 */
function createFilePart(filename: string, sizeBytes?: number): MessagePart {
  return {
    type: 'file',
    id: `file-${Date.now()}`,
    file: {
      filename,
      file_data: `data:application/octet-stream;base64,MOCK_FILE_DATA`,
      mime_type: 'application/pdf',
      size_bytes: sizeBytes || 1024 * 50 // 默认 50KB
    }
  }
}

// ============ Mock 数据集 ============

// 有效的测试图片
const testImageUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// 长文本
const longText = `这是一段很长的文本消息，用于测试消息气泡的换行和滚动效果。`.repeat(10)

// Markdown 格式文本
const markdownText = `# 分析报告

## 主要发现
- **重点 1**: 用户体验需要优化
- **重点 2**: 性能问题已定位
- **重点 3**: 代码质量良好

\`\`\`python
def analyze_data(data):
    return data.mean()
\`\`\`

数学公式: $E = mc^2$`

// ============ Meta 配置 ============
const meta: Meta<typeof MessageItem> = {
  title: 'Chat/MessageItem',
  component: MessageItem,
  tags: ['autodocs'],
  argTypes: {
    message: {
      control: 'object',
      description: '消息数据对象',
      table: {
        type: { summary: 'MessageItemData' }
      }
    },
    conversationId: {
      control: 'text',
      description: '对话 ID',
      table: {
        type: { summary: 'string' }
      }
    },
    isStreaming: {
      control: 'boolean',
      description: '是否正在流式传输',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' }
      }
    },
    showActions: {
      control: 'boolean',
      description: '是否显示操作按钮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' }
      }
    },
    hasBranchVersions: {
      control: 'boolean',
      description: '是否有分支版本',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' }
      }
    }
  },
  parameters: {
    docs: {
      description: {
        component: `
# MessageItem 组件

聊天界面的核心消息卡片组件，支持多模态内容展示。

## 特性
- ✅ 用户/AI 消息双向展示
- ✅ 多模态内容 (文本、图片、文件)
- ✅ 流式传输状态
- ✅ Markdown/LaTeX 渲染 (通过 ContentRenderer)
- ✅ 分支版本控制
- ✅ 消息操作 (编辑、删除、重新生成、复制)
- ✅ 文件大小格式化

## 事件
- \`@edit\`: 编辑消息 (仅用户消息)
- \`@regenerate\`: 重新生成 (仅 AI 消息)
- \`@delete\`: 删除消息
- \`@switch-version\`: 切换分支版本

## 依赖组件
- \`ContentRenderer\`: Markdown/LaTeX 渲染
- \`MessageBranchController\`: 分支版本控制器
        `
      }
    },
    layout: 'padded'
  },
  decorators: [
    (story) => ({
      components: { story },
      template: `
        <div class="max-w-2xl mx-auto p-4 bg-gray-50">
          <story />
        </div>
      `
    })
  ]
} satisfies Meta<typeof MessageItem>

export default meta
type Story = StoryObj<typeof meta>

// ============ Stories 定义 ============

// 1. 标准用户消息
export const StandardUser: Story = {
  args: {
    message: createMockMessage({
      role: 'user',
      parts: [createTextPart('你好，这是一条用户消息。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: '标准的用户文本消息。显示在右侧，蓝色气泡，头像显示 "U"。'
      }
    }
  }
}

// 2. 标准 AI 消息
export const StandardAI: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('你好！我是 AI 助手，很高兴为你服务。有什么我可以帮助的吗？')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: '标准的 AI 文本消息。显示在左侧，白色气泡，头像显示 "AI"。'
      }
    }
  }
}

// 3. 流式传输中 (Streaming)
export const Streaming: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('正在输出的文本，这是流式传输状态...')]
    }),
    conversationId: 'conv-1',
    isStreaming: true,
    showActions: false, // 流式时通常隐藏操作按钮
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**流式传输状态**: 
- \`isStreaming: true\` 时显示纯文本 (不渲染 Markdown)
- 提升性能，避免实时 Markdown 解析
- 通常隐藏操作按钮
- 在真实应用中，文本会逐字追加

💡 **注意**: 此 Story 是静态的，真实的流式效果需要配合 API。
        `
      }
    }
  }
}

// 4. 长文本消息
export const LongText: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart(longText)]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: '长文本消息。验证气泡的自动换行和最大宽度 (80%) 限制。'
      }
    }
  }
}

// 5. Markdown 格式消息
export const WithMarkdown: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart(markdownText)]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**Markdown 渲染测试**:
- 标题 (H1, H2)
- 列表 (有序/无序)
- 加粗和斜体
- 代码块 (Python 语法高亮)
- LaTeX 数学公式

通过 \`ContentRenderer\` 组件渲染。
        `
      }
    }
  }
}

// 6. 包含图片的消息
export const WithImage: Story = {
  args: {
    message: createMockMessage({
      role: 'user',
      parts: [
        createTextPart('这是我上传的图片：'),
        createImagePart(testImageUri)
      ]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**多模态消息 - 图片**:
- 文本 + 图片的组合
- 图片显示在消息气泡内
- 最大宽度限制为 \`max-w-sm\`
- 支持 lazy loading
        `
      }
    }
  }
}

// 7. 包含文件的消息
export const WithFile: Story = {
  args: {
    message: createMockMessage({
      role: 'user',
      parts: [
        createTextPart('请查看附件：'),
        createFilePart('项目报告.pdf', 1024 * 150) // 150KB
      ]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**多模态消息 - 文件**:
- 显示文件名和大小
- 附件图标 (回形针)
- "打开" 下载链接
- 文件大小自动格式化 (B/KB/MB/GB)
        `
      }
    }
  }
}

// 8. 多模态混合 (文本 + 图片 + 文件)
export const MultiModal: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [
        createTextPart('以下是分析结果：'),
        createImagePart(testImageUri),
        createTextPart('详细数据请查看附件：'),
        createFilePart('数据分析.xlsx', 1024 * 500) // 500KB
      ]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**真实场景模拟**:
- 文本 → 图片 → 文本 → 文件
- 验证多种 Part 类型的混合渲染
- 测试布局和间距
        `
      }
    }
  }
}

// 9. 带分支版本控制
export const WithBranches: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('这是一条有多个版本的回复。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: true // 启用分支控制器
  },
  parameters: {
    docs: {
      description: {
        story: `
**分支版本控制**:
- \`hasBranchVersions: true\` 时显示 \`MessageBranchController\`
- 用于切换不同版本的 AI 回复
- 显示版本计数器 (如 "1 / 3")

⚠️ **注意**: \`MessageBranchController\` 需要正确的 branchId 和 conversationId。
        `
      }
    }
  }
}

// 10. 隐藏操作按钮
export const NoActions: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('这条消息没有操作按钮。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: false, // 隐藏操作按钮
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: '隐藏操作按钮的消息。适用于展示历史记录或只读模式。'
      }
    }
  }
}

// 11. 用户消息 - 显示编辑按钮
export const UserWithActions: Story = {
  args: {
    message: createMockMessage({
      role: 'user',
      parts: [createTextPart('这是可编辑的用户消息。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  render: (args) => ({
    components: { MessageItem },
    setup() {
      const handleEdit = () => {
        alert('✏️ 编辑消息')
      }
      const handleDelete = () => {
        alert('🗑️ 删除消息')
      }
      return { args, handleEdit, handleDelete }
    },
    template: `
      <MessageItem 
        v-bind="args"
        @edit="handleEdit"
        @delete="handleDelete"
      />
    `
  }),
  parameters: {
    docs: {
      description: {
        story: `
**用户消息操作**:
- 编辑按钮 (仅用户消息)
- 删除按钮
- 复制按钮

点击按钮查看事件触发。
        `
      }
    }
  }
}

// 12. AI 消息 - 显示重新生成按钮
export const AIWithActions: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('这是可重新生成的 AI 消息。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  render: (args) => ({
    components: { MessageItem },
    setup() {
      const handleRegenerate = () => {
        alert('🔄 重新生成消息')
      }
      const handleDelete = () => {
        alert('🗑️ 删除消息')
      }
      return { args, handleRegenerate, handleDelete }
    },
    template: `
      <MessageItem 
        v-bind="args"
        @regenerate="handleRegenerate"
        @delete="handleDelete"
      />
    `
  }),
  parameters: {
    docs: {
      description: {
        story: `
**AI 消息操作**:
- 重新生成按钮 (仅 AI 消息)
- 删除按钮
- 复制按钮

点击按钮查看事件触发。
        `
      }
    }
  }
}

// 13. 对话场景模拟
export const ConversationScenario: Story = {
  render: () => ({
    components: { MessageItem },
    setup() {
      const messages = [
        createMockMessage({
          branchId: 'msg-1',
          role: 'user',
          parts: [createTextPart('你能帮我分析一下这张图片吗？'), createImagePart(testImageUri)]
        }),
        createMockMessage({
          branchId: 'msg-2',
          role: 'assistant',
          parts: [createTextPart('当然可以！这是一张**测试图片**。\n\n根据我的分析：\n- 图片尺寸: 1x1 像素\n- 格式: PNG\n- 颜色: 透明')]
        }),
        createMockMessage({
          branchId: 'msg-3',
          role: 'user',
          parts: [createTextPart('谢谢！能生成一份报告吗？')]
        }),
        createMockMessage({
          branchId: 'msg-4',
          role: 'assistant',
          parts: [
            createTextPart('报告已生成，请查看附件：'),
            createFilePart('图片分析报告.pdf', 1024 * 200)
          ]
        })
      ]
      
      return { messages }
    },
    template: `
      <div class="max-w-2xl mx-auto space-y-4 p-4 bg-gray-50">
        <MessageItem
          v-for="message in messages"
          :key="message.branchId"
          :message="message"
          conversation-id="conv-1"
          :show-actions="true"
        />
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: `
**真实对话场景**:
- 用户提问 + 图片上传
- AI 回复 (Markdown)
- 用户追问
- AI 回复 + 文件附件

验证消息流的视觉连贯性。
        `
      }
    }
  }
}

// 14. 向后兼容测试 (旧格式)
export const LegacyFormat: Story = {
  args: {
    message: {
      branchId: 'legacy-1',
      role: 'user',
      text: '这是旧格式的消息 (使用 text 字段)'
    } as MessageItemData,
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**向后兼容性测试**:
- 使用旧的 \`text\` 字段而非 \`parts\`
- 组件应能正确提取和显示文本
- 验证 \`extractMessageText\` 函数
        `
      }
    }
  }
}

// 15. 交互式 Playground
export const Playground: Story = {
  args: {
    message: createMockMessage({
      role: 'assistant',
      parts: [createTextPart('这是一条可编辑的消息。在 Controls 面板中修改属性。')]
    }),
    conversationId: 'conv-1',
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  },
  parameters: {
    docs: {
      description: {
        story: `
**交互式测试**:
1. 在 Controls 面板中修改 Props
2. 切换 \`isStreaming\` 观察渲染差异
3. 切换 \`showActions\` 显示/隐藏按钮
4. 切换 \`hasBranchVersions\` 启用分支控制器
5. 修改 \`message.role\` 切换用户/AI 消息

**测试建议**:
**测试建议**:
- 尝试切换 \`role\` 为 'user' 或 'assistant'
- 观察气泡颜色、位置、头像的变化
- 观察操作按钮的差异 (编辑 vs 重新生成)
        `
      }
    }
  }
}

// 16. 所有状态矩阵
export const AllStates: Story = {
  render: () => ({
    components: { MessageItem },
    setup() {
      const states = [
        {
          title: 'User Text',
          message: createMockMessage({
            role: 'user',
            parts: [createTextPart('用户文本消息')]
          })
        },
        {
          title: 'AI Text',
          message: createMockMessage({
            role: 'assistant',
            parts: [createTextPart('AI 文本消息')]
          })
        },
        {
          title: 'Streaming',
          message: createMockMessage({
            role: 'assistant',
            parts: [createTextPart('流式传输中...')]
          }),
          isStreaming: true
        },
        {
          title: 'With Image',
          message: createMockMessage({
            role: 'user',
            parts: [createTextPart('图片消息'), createImagePart(testImageUri)]
          })
        },
        {
          title: 'With File',
          message: createMockMessage({
            role: 'assistant',
            parts: [createTextPart('文件消息'), createFilePart('附件.pdf')]
          })
        },
        {
          title: 'Markdown',
          message: createMockMessage({
            role: 'assistant',
            parts: [createTextPart('# 标题\n\n**加粗** *斜体*\n\n```js\nconst x = 1;\n```')]
          })
        }
      ]
      return { states }
    },
    template: `
      <div class="space-y-8">
        <div v-for="(state, index) in states" :key="index" class="border border-gray-200 rounded-lg p-4 bg-white">
          <h3 class="text-sm font-semibold mb-3 text-gray-700">{{ state.title }}</h3>
          <div class="max-w-2xl mx-auto bg-gray-50 p-4 rounded">
            <MessageItem 
              :message="state.message"
              conversation-id="conv-1"
              :is-streaming="state.isStreaming || false"
              :show-actions="true"
            />
          </div>
        </div>
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '**状态矩阵**: 所有主要消息类型的并排展示，用于视觉回归测试。'
      }
    }
  }
}
