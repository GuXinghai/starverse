/**
 * ========================================
 * useMenuPositioning - 菜单定位算法 Composable
 * ========================================
 * 
 * 通用的浮动菜单定位逻辑，可在多个组件间复用
 * 
 * 核心功能:
 *   1. 根据锚点元素位置计算菜单最佳位置
 *   2. 支持 8 个方向的自动布局 (right/left/top/bottom + start/end)
 *   3. 边界碰撞检测，自动选择备选位置
 *   4. 计算 transform-origin 用于动画效果
 * 
 * 使用场景:
 *   - 对话右键菜单 (contextMenu)
 *   - 项目分配子菜单 (projectMenu)
 *   - 未来的 Tooltip、Popover 组件
 * 
 * 使用示例:
 *   const { computeMenuPosition } = useMenuPositioning()
 *   const position = computeMenuPosition(anchorRect, 320, 400)
 *   // { x: 100, y: 200, origin: 'top left', maxW: 320, maxH: 400 }
 * 
 * 未来改进:
 *   - 考虑使用 @floating-ui/vue 替代手动实现
 *   - 支持自定义边距配置
 *   - 添加 RTL 布局支持
 * ========================================
 */

/**
 * 菜单放置位置类型
 * 
 * 格式: [方向]-[对齐方式]
 * - 方向: right, left, top, bottom
 * - 对齐方式: start (开始), end (结束)
 */
export type Placement =
  | 'right-start' | 'right-end'
  | 'left-start' | 'left-end'
  | 'bottom-start' | 'bottom-end'
  | 'top-start' | 'top-end'

/**
 * 菜单位置计算结果
 */
export interface MenuPosition {
  /** 菜单左上角 X 坐标 (px) */
  x: number
  /** 菜单左上角 Y 坐标 (px) */
  y: number
  /** transform-origin 值，用于动画效果 */
  origin: string
  /** 菜单最大宽度 (px) */
  maxW: number
  /** 菜单最大高度 (px) */
  maxH: number
}

/**
 * 默认的菜单放置位置优先级
 * 优先尝试右侧放置，然后左侧，最后上下
 */
const DEFAULT_PLACEMENTS: Placement[] = [
  'right-start',
  'right-end',
  'left-start',
  'bottom-start',
  'top-start'
]

/**
 * 菜单与视口边缘的最小间距 (px)
 */
const MENU_PADDING = 8

export function useMenuPositioning() {
  /**
   * 计算菜单的最佳显示位置
   * 
   * @param anchorRect - 锚点元素的 DOMRect
   * @param menuW - 菜单宽度 (px)
   * @param menuH - 菜单高度 (px)
   * @param prefer - 优先尝试的放置位置数组，默认为 DEFAULT_PLACEMENTS
   * @returns 菜单位置信息
   * 
   * 算法流程:
   *   1. 遍历所有优先位置
   *   2. 计算每个位置的坐标和 transform-origin
   *   3. 检查是否超出视口边界
   *   4. 返回第一个不溢出的位置
   *   5. 如果所有位置都溢出，返回左上角 (PADDING, PADDING)
   */
  const computeMenuPosition = (
    anchorRect: DOMRect,
    menuW: number,
    menuH: number,
    prefer: Placement[] = DEFAULT_PLACEMENTS
  ): MenuPosition => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // 定义 8 个方向的位置计算器
    const placements: Record<Placement, () => { x: number; y: number; origin: string }> = {
      'right-start': () => ({
        x: anchorRect.right + MENU_PADDING,
        y: anchorRect.top,
        origin: 'top left'
      }),
      'right-end': () => ({
        x: anchorRect.right + MENU_PADDING,
        y: anchorRect.bottom - menuH,
        origin: 'bottom left'
      }),
      'left-start': () => ({
        x: anchorRect.left - MENU_PADDING - menuW,
        y: anchorRect.top,
        origin: 'top right'
      }),
      'left-end': () => ({
        x: anchorRect.left - MENU_PADDING - menuW,
        y: anchorRect.bottom - menuH,
        origin: 'bottom right'
      }),
      'bottom-start': () => ({
        x: anchorRect.left,
        y: anchorRect.bottom + MENU_PADDING,
        origin: 'top left'
      }),
      'bottom-end': () => ({
        x: anchorRect.right - menuW,
        y: anchorRect.bottom + MENU_PADDING,
        origin: 'top right'
      }),
      'top-start': () => ({
        x: anchorRect.left,
        y: anchorRect.top - MENU_PADDING - menuH,
        origin: 'bottom left'
      }),
      'top-end': () => ({
        x: anchorRect.right - menuW,
        y: anchorRect.top - MENU_PADDING - menuH,
        origin: 'bottom right'
      })
    }

    // 计算菜单的最大尺寸（确保不超过视口）
    const maxWidth = Math.max(160, viewportWidth - MENU_PADDING * 2)
    const maxHeight = Math.max(120, viewportHeight - MENU_PADDING * 2)

    // 遍历优先级列表，寻找合适的位置
    for (const placement of prefer) {
      const resolver = placements[placement]
      if (!resolver) {
        continue
      }

      let { x, y, origin } = resolver()

      // 约束坐标在视口范围内
      const maxX = Math.max(MENU_PADDING, viewportWidth - MENU_PADDING - menuW)
      const maxY = Math.max(MENU_PADDING, viewportHeight - MENU_PADDING - menuH)

      x = Math.min(Math.max(MENU_PADDING, x), maxX)
      y = Math.min(Math.max(MENU_PADDING, y), maxY)

      // 检查是否溢出视口边界
      const overflow =
        x + menuW > viewportWidth - MENU_PADDING ||
        x < MENU_PADDING ||
        y + menuH > viewportHeight - MENU_PADDING ||
        y < MENU_PADDING

      // 找到第一个不溢出的位置，立即返回
      if (!overflow) {
        return { x, y, origin, maxW: maxWidth, maxH: maxHeight }
      }
    }

    // 所有位置都溢出，返回左上角默认位置
    return {
      x: MENU_PADDING,
      y: MENU_PADDING,
      origin: 'top left',
      maxW: maxWidth,
      maxH: maxHeight
    }
  }

  return {
    computeMenuPosition
  }
}
