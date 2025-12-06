import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y"
  ],
  "framework": {
    "name": "@storybook/vue3-vite",
    "options": {
      // 使用 vue-component-meta 替代默认 docgen，更好地支持 TypeScript
      "docgen": "vue-component-meta"
    }
  }
};
export default config;