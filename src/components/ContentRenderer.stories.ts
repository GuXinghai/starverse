import type { Meta, StoryObj } from '@storybook/vue3'
import ContentRenderer from './ContentRenderer.vue'

// ============ Mock 数据定义 ============
const mockData = {
  pureText: 'Hello, World! This is plain text without any formatting.',
  
  markdownBasic: `# Heading 1
## Heading 2
### Heading 3

**Bold text** and *italic text* and ~~strikethrough~~.`,
  
  markdownList: `### Unordered List
- Item 1
- Item 2
  - Nested Item 2.1
  - Nested Item 2.2
- Item 3

### Ordered List
1. First item
2. Second item
3. Third item`,
  
  markdownQuote: `> This is a blockquote.
> 
> It can span multiple lines.
>
>> And can be nested.`,
  
  codeInline: 'Use the `console.log()` function to print output.',
  
  codeBlockJavaScript: `\`\`\`javascript
// JavaScript Code Example
const fetchData = async () => {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
};
\`\`\``,
  
  codeBlockPython: `\`\`\`python
# Python Code Example
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))
\`\`\``,
  
  latexInline: 'Einstein\'s famous equation: $E = mc^2$',
  
  latexBlock: `$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

The quadratic formula:
$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$`,
  
  mixedContent: `# AI Response with Mixed Content

Here's a **mathematical proof** with code:

## Step 1: Define the function

\`\`\`python
def calculate_sum(n):
    return sum(range(1, n+1))
\`\`\`

## Step 2: Mathematical formula

The sum of first $n$ natural numbers is:

$$
S_n = \\frac{n(n+1)}{2}
$$

## Step 3: Verify

For $n = 10$:
- Code output: \`55\`
- Formula: $S_{10} = \\frac{10 \\times 11}{2} = 55$ ✓

> **Note**: Both methods produce the same result!`,
  
  nestedMarkdown: `\`\`\`
# This is Markdown inside a code block
- It should be rendered as nested Markdown
- Not as plain text

**Bold** and *italic* should work!
\`\`\``,
  
  errorHandling: `This contains an invalid LaTeX formula: $\\frac{1}{$`,
  
  longContent: `# Long Document Test

${'Lorem ipsum dolor sit amet. '.repeat(200)}

## Section 2

${'More content here. '.repeat(100)}

\`\`\`javascript
${'// Comment line\n'.repeat(50)}
\`\`\``,
  
  xssTest: `<script>alert('XSS')</script>
<img src=x onerror="alert('XSS')">
<a href="javascript:alert('XSS')">Click me</a>

This should be **sanitized** by DOMPurify.`
}

// ============ Meta 配置 ============
const meta: Meta<typeof ContentRenderer> = {
  title: 'Components/ContentRenderer',
  component: ContentRenderer,
  tags: ['autodocs'],
  argTypes: {
    content: {
      control: 'text',
      description: '要渲染的内容 (支持 Markdown、LaTeX、代码高亮)',
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
# ContentRenderer 组件

智能渲染 Markdown、LaTeX 数学公式和代码块的通用组件。

## 特性
- ✅ GitHub Flavored Markdown (GFM)
- ✅ KaTeX 数学公式渲染 (行内 \`$...$\` 和块级 \`$$...$$\`)
- ✅ 12种语言代码高亮 (highlight.js)
- ✅ 嵌套 Markdown 渲染 (代码块内的 Markdown)
- ✅ 暗色模式适配

## 渲染流程
1. 提取并渲染 LaTeX 公式 (避免被 Markdown 处理)
2. Markdown 转 HTML (marked.js)
3. 代码高亮 (highlight.js)
4. 替换公式占位符

## 支持的语言
JavaScript, TypeScript, Python, JSON, Bash, Shell, HTML, XML, CSS, Markdown
        `
      }
    },
    layout: 'padded',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1a1a1a' }
      ]
    }
  }
} satisfies Meta<typeof ContentRenderer>

export default meta
type Story = StoryObj<typeof meta>

// ============ Stories 定义 ============

// 1. 纯文本
export const PureText: Story = {
  args: {
    content: mockData.pureText
  },
  parameters: {
    docs: {
      description: {
        story: '纯文本内容，无任何格式化标记。'
      }
    }
  }
}

// 2. Markdown 基础语法
export const MarkdownBasic: Story = {
  args: {
    content: mockData.markdownBasic
  },
  parameters: {
    docs: {
      description: {
        story: '标题、加粗、斜体、删除线等基础 Markdown 语法。'
      }
    }
  }
}

// 3. Markdown 列表
export const MarkdownList: Story = {
  args: {
    content: mockData.markdownList
  },
  parameters: {
    docs: {
      description: {
        story: '有序列表、无序列表和嵌套列表。'
      }
    }
  }
}

// 4. Markdown 引用块
export const MarkdownQuote: Story = {
  args: {
    content: mockData.markdownQuote
  },
  parameters: {
    docs: {
      description: {
        story: '块引用和嵌套引用。'
      }
    }
  }
}

// 5. 行内代码
export const CodeInline: Story = {
  args: {
    content: mockData.codeInline
  },
  parameters: {
    docs: {
      description: {
        story: '行内代码使用 `backticks` 包裹。'
      }
    }
  }
}

// 6. JavaScript 代码块
export const CodeBlockJavaScript: Story = {
  args: {
    content: mockData.codeBlockJavaScript
  },
  parameters: {
    docs: {
      description: {
        story: 'JavaScript 语法高亮 (highlight.js)。'
      }
    }
  }
}

// 7. Python 代码块
export const CodeBlockPython: Story = {
  args: {
    content: mockData.codeBlockPython
  },
  parameters: {
    docs: {
      description: {
        story: 'Python 语法高亮。'
      }
    }
  }
}

// 8. 行内 LaTeX 公式
export const LatexInline: Story = {
  args: {
    content: mockData.latexInline
  },
  parameters: {
    docs: {
      description: {
        story: '行内数学公式使用 `$...$` 包裹。'
      }
    }
  }
}

// 9. 块级 LaTeX 公式
export const LatexBlock: Story = {
  args: {
    content: mockData.latexBlock
  },
  parameters: {
    docs: {
      description: {
        story: '块级公式使用 `$$...$$` 包裹，支持多行公式。'
      }
    }
  }
}

// 10. 混合内容 (⭐ 最重要)
export const MixedContent: Story = {
  args: {
    content: mockData.mixedContent
  },
  parameters: {
    docs: {
      description: {
        story: '**真实场景**: AI 回复包含 Markdown、LaTeX 和代码块的混合内容。这是最常见的使用场景。'
      }
    }
  }
}

// 11. 嵌套 Markdown (高级特性)
export const NestedMarkdown: Story = {
  args: {
    content: mockData.nestedMarkdown
  },
  parameters: {
    docs: {
      description: {
        story: '代码块内的 Markdown 会被递归渲染 (无语言或 `markdown`/`md`/`text` 语言标识时)。'
      }
    }
  }
}

// 12. 错误处理
export const ErrorHandling: Story = {
  args: {
    content: mockData.errorHandling
  },
  parameters: {
    docs: {
      description: {
        story: 'LaTeX 渲染错误时应优雅降级，保留原始内容。'
      }
    }
  }
}

// 13. 空内容
export const EmptyContent: Story = {
  args: {
    content: ''
  },
  parameters: {
    docs: {
      description: {
        story: '空字符串应返回空 div，不报错。'
      }
    }
  }
}

// 14. 长文本性能测试
export const LongContent: Story = {
  args: {
    content: mockData.longContent
  },
  parameters: {
    docs: {
      description: {
        story: '**性能测试**: 5000+ 字长文档渲染时间应 <200ms。打开浏览器 DevTools Performance 面板验证。'
      }
    }
  }
}

// 15. 交互式 Playground
export const Playground: Story = {
  args: {
    content: mockData.mixedContent
  },
  parameters: {
    docs: {
      description: {
        story: '**交互式编辑器**: 在 Controls 面板中编辑 `content` 属性，实时预览渲染效果。'
      }
    }
  }
}

// 16. 所有变体矩阵 (用于截图测试)
export const AllVariants: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const variants = [
        { title: 'Pure Text', content: mockData.pureText },
        { title: 'Markdown Basic', content: mockData.markdownBasic },
        { title: 'Code Block', content: mockData.codeBlockJavaScript },
        { title: 'LaTeX Inline', content: mockData.latexInline },
        { title: 'Mixed Content', content: mockData.mixedContent }
      ]
      return { variants }
    },
    template: `
      <div class="space-y-8">
        <div v-for="(variant, index) in variants" :key="index" class="border border-gray-200 rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-2 text-gray-700">{{ variant.title }}</h3>
          <ContentRenderer :content="variant.content" />
        </div>
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '**矩阵视图**: 所有主要变体的并排展示，用于视觉回归测试 (配合 Chromatic 或截图对比)。'
      }
    }
  }
}
