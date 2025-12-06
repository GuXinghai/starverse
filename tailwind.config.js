/**
 * Tailwind CSS v4 配置文件
 * 
 * ⚠️ 注意：此配置文件已弃用，仅保留 content 路径配置
 * 所有主题配置（颜色、间距、字体等）已迁移到 src/style.css 的 @theme 块
 * 
 * Tailwind v4 采用 CSS 优先策略：
 * - 主题配置在 CSS 中使用 @theme 指令
 * - 支持热更新，无需重启开发服务器
 * - 更好地支持动态主题和媒体查询
 * 
 * 迁移日期: 2025-11-29
 */

/** @type {import('tailwindcss').Config} */
export default {
  // 仅保留内容路径配置
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "./.storybook/**/*.{js,ts,tsx}",
  ],
  
  // 所有主题配置已迁移到 src/style.css
  // 如需修改主题，请编辑 src/style.css 中的 @theme 块
  theme: {},
  
  plugins: [],
}