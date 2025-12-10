import type { Meta, StoryObj } from '@storybook/vue3'
import AttachmentPreview from './AttachmentPreview.vue'

// ============ Mock 数据定义 ============

// 有效的测试图片 (1x1 像素透明 PNG)
const validImageDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// 有效的 JPEG 图片 (红色 1x1 像素)
const redImageDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKKKAP/2Q=='

// 较大的图片 (100x100 像素蓝色正方形)
const largeImageDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAA5ElEQVR42u3RAQ0AAAjDMO5fNCCDkC5z0HTVrisFCBABIkAEiAARIAJEgAgQASJABIgAESACRIAIEAEiQASIABEgAkSACBABIkAEiAARIAJEgAgQASJABIgAESACRIAIEAEiQASIABEgAkSACBABIkAEiAARIAJEgAgQASJABIgAESACRIAIEAEiQASIABEgAkSACBABIkAEiAARIAJEgAgQASJABIgAESACRIAIEAEiQASIABEgAkSACBABIkAEiAARIAJEgAgQASJABIgAESACRIAIEAEiQASIABEgAkSACBABIkCe1gBOrwAHuXpN8QAAAABJRU5ErkJggg=='

// 无效的图片 (错误的 base64)
const invalidImageDataUri = 'data:image/png;base64,INVALID_BASE64_STRING'

// 空白/损坏的图片
const brokenImageDataUri = ''

// ============ Meta 配置 ============
const meta: Meta<typeof AttachmentPreview> = {
  title: 'Components/AttachmentPreview',
  component: AttachmentPreview,
  tags: ['autodocs'],
  argTypes: {
    imageDataUri: {
      control: 'text',
      description: '图片的 Base64 Data URI',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '""' }
      }
    },
    altText: {
      control: 'text',
      description: '图片的替代文本 (用于无障碍和悬停提示)',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '""' }
      }
    }
  },
  parameters: {
    docs: {
      description: {
        component: `
# AttachmentPreview 组件

用于预览上传的图片附件，支持加载状态、错误处理和删除操作。

## 特性
- ✅ 加载状态展示 (Spinner)
- ✅ 错误状态展示 (Broken Image 图标)
- ✅ 悬停显示文件大小
- ✅ 悬停显示删除按钮
- ✅ 自动从 Base64 计算文件大小
- ✅ 响应式边框变色

## 事件
- \`@remove\`: 点击删除按钮时触发

## 使用场景
- 聊天输入框的图片预览
- 上传前的图片确认
- 附件管理面板
        `
      }
    },
    layout: 'centered'
  }
} satisfies Meta<typeof AttachmentPreview>

export default meta
type Story = StoryObj<typeof meta>

// ============ Stories 定义 ============

// 1. 加载完成状态 (默认)
export const Success: Story = {
  args: {
    imageDataUri: validImageDataUri,
    altText: '测试图片'
  },
  parameters: {
    docs: {
      description: {
        story: '图片加载成功状态。显示图片预览，悬停时显示删除按钮和文件大小。'
      }
    }
  }
}

// 2. 加载中状态
export const Loading: Story = {
  args: {
    imageDataUri: largeImageDataUri,
    altText: '加载中的图片'
  },
  parameters: {
    docs: {
      description: {
        story: '图片加载中状态。显示 Spinner 动画。注意：由于图片较小，可能很快加载完成。'
      }
    }
  },
  play: async () => {
    // 提示：真实的加载状态很难模拟，因为 base64 图片通常瞬间加载
    console.log('💡 提示：要测试真实的加载状态，请使用网络较慢的图片 URL')
  }
}

// 3. 错误状态
export const Error: Story = {
  args: {
    imageDataUri: invalidImageDataUri,
    altText: '加载失败的图片'
  },
  parameters: {
    docs: {
      description: {
        story: '图片加载失败状态。显示错误图标（红色警告）。'
      }
    }
  }
}

// 4. 空 URI (边界情况)
export const EmptyURI: Story = {
  args: {
    imageDataUri: brokenImageDataUri,
    altText: '空白图片'
  },
  parameters: {
    docs: {
      description: {
        story: '空 URI 边界情况。应显示错误状态。'
      }
    }
  }
}

// 5. 大图片
export const LargeImage: Story = {
  args: {
    imageDataUri: largeImageDataUri,
    altText: '大尺寸图片 (100x100)'
  },
  parameters: {
    docs: {
      description: {
        story: '较大的图片 (100x100 像素)。悬停时可以看到文件大小约 0.4 KB。'
      }
    }
  }
}

// 6. 红色图片 (JPEG 格式)
export const JPEGImage: Story = {
  args: {
    imageDataUri: redImageDataUri,
    altText: 'JPEG 格式图片'
  },
  parameters: {
    docs: {
      description: {
        story: 'JPEG 格式的图片预览。验证组件对不同图片格式的支持。'
      }
    }
  }
}

// 7. 悬停状态演示
export const HoverState: Story = {
  args: {
    imageDataUri: validImageDataUri,
    altText: '悬停测试'
  },
  parameters: {
    docs: {
      description: {
        story: `
**悬停效果展示:**
- 🎯 将鼠标移到图片上，观察以下变化：
  1. 边框颜色从灰色变为蓝色
  2. 右上角出现删除按钮
  3. 底部显示文件大小提示
        `
      }
    }
  }
}

// 8. 删除操作演示
export const WithRemoveAction: Story = {
  args: {
    imageDataUri: largeImageDataUri,
    altText: '可删除的图片'
  },
  render: (args) => ({
    components: { AttachmentPreview },
    setup() {
      const handleRemove = () => {
        alert('🗑️ 删除按钮被点击！\n\n在实际应用中，这里会触发 @remove 事件。')
      }
      return { args, handleRemove }
    },
    template: `
      <AttachmentPreview 
        v-bind="args" 
        @remove="handleRemove"
      />
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '点击删除按钮会触发 `@remove` 事件。此示例使用 alert 模拟。'
      }
    }
  }
}

// 9. 多个附件预览 (网格布局)
export const MultipleAttachments: Story = {
  render: () => ({
    components: { AttachmentPreview },
    setup() {
      const attachments = [
        { id: 1, uri: validImageDataUri, alt: '图片 1' },
        { id: 2, uri: redImageDataUri, alt: '图片 2' },
        { id: 3, uri: largeImageDataUri, alt: '图片 3' },
        { id: 4, uri: invalidImageDataUri, alt: '错误图片' }
      ]
      
      const handleRemove = (id: number) => {
        console.log(`删除附件 ${id}`)
      }
      
      return { attachments, handleRemove }
    },
    template: `
      <div class="flex gap-4 flex-wrap">
        <AttachmentPreview
          v-for="attachment in attachments"
          :key="attachment.id"
          :image-data-uri="attachment.uri"
          :alt-text="attachment.alt"
          @remove="handleRemove(attachment.id)"
        />
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '**真实场景模拟**: 多个附件的网格预览，常见于聊天输入框。'
      }
    }
  }
}

// 10. 交互式 Playground
export const Playground: Story = {
  args: {
    imageDataUri: largeImageDataUri,
    altText: '可编辑的图片'
  },
  parameters: {
    docs: {
      description: {
        story: `
**交互式测试:**
1. 在 Controls 面板中修改 \`imageDataUri\`
2. 尝试粘贴不同的 Base64 图片
3. 观察加载/错误状态的变化

**测试用例:**
- 有效图片: 使用上面的 \`validImageDataUri\`
- 无效图片: 输入 \`data:image/png;base64,INVALID\`
- 空字符串: 清空 \`imageDataUri\`
        `
      }
    }
  }
}

// 11. 性能测试 (大量附件)
export const PerformanceTest: Story = {
  render: () => ({
    components: { AttachmentPreview },
    setup() {
      // 生成 20 个附件
      const attachments = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        uri: i % 3 === 0 ? invalidImageDataUri : (i % 2 === 0 ? redImageDataUri : largeImageDataUri),
        alt: `图片 ${i + 1}`
      }))
      
      return { attachments }
    },
    template: `
      <div class="grid grid-cols-5 gap-4 max-w-4xl">
        <AttachmentPreview
          v-for="attachment in attachments"
          :key="attachment.id"
          :image-data-uri="attachment.uri"
          :alt-text="attachment.alt"
        />
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '**性能测试**: 渲染 20 个附件预览。观察渲染性能和内存占用。'
      }
    }
  }
}

// 12. 所有状态矩阵
export const AllStates: Story = {
  render: () => ({
    components: { AttachmentPreview },
    setup() {
      const states = [
        { title: 'Success', uri: validImageDataUri, alt: '成功状态' },
        { title: 'Large Image', uri: largeImageDataUri, alt: '大图片' },
        { title: 'JPEG', uri: redImageDataUri, alt: 'JPEG 图片' },
        { title: 'Error', uri: invalidImageDataUri, alt: '错误状态' },
        { title: 'Empty', uri: brokenImageDataUri, alt: '空 URI' }
      ]
      return { states }
    },
    template: `
      <div class="space-y-6">
        <div v-for="state in states" :key="state.title" class="border border-gray-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold mb-3 text-gray-700">{{ state.title }}</h3>
          <AttachmentPreview 
            :image-data-uri="state.uri" 
            :alt-text="state.alt"
          />
        </div>
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '**状态矩阵**: 所有主要状态的并排展示，用于视觉回归测试。'
      }
    }
  }
}
