import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3'
import { createPinia } from 'pinia'
import '../src/style.css'  // Import Tailwind CSS and design tokens

// 初始化 Pinia（ModernChatInput 需要 useAppStore 和 useModelStore）
const pinia = createPinia()
setup((app) => {
  app.use(pinia)
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1a1a1a' },
      ],
    },
  },
};

export default preview;