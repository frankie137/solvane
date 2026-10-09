/** 自定义导航栏需要的尺寸：状态栏 + 与胶囊按钮垂直居中对齐的导航区 */
export interface NavMetrics {
  statusBarHeight: number
  /** 导航区高度（不含状态栏） */
  navBarHeight: number
  /** 状态栏 + 导航区 */
  totalHeight: number
  /** 右侧为胶囊按钮预留的宽度 */
  capsuleReserve: number
  /** 底部安全区高度（全面屏手势条） */
  safeAreaBottom: number
}

export interface LayoutInput {
  statusBarHeight?: number
  windowWidth: number
  screenHeight: number
  safeArea?: { bottom: number } | null
  menuButton?: { top: number; height: number; left: number } | null
}

const DEFAULT_NAV_HEIGHT = 44
const DEFAULT_CAPSULE_RESERVE = 96

export function computeNavMetrics(input: LayoutInput): NavMetrics {
  const statusBarHeight = Math.max(0, input.statusBarHeight ?? 20)
  const menu = input.menuButton
  // 部分机型或开发者工具会返回全 0 的胶囊信息，此时退回默认值
  const menuValid = !!menu && menu.height > 0 && menu.top >= statusBarHeight && menu.left > 0

  const navBarHeight = menuValid
    ? (menu.top - statusBarHeight) * 2 + menu.height
    : DEFAULT_NAV_HEIGHT
  const capsuleReserve = menuValid
    ? Math.max(0, input.windowWidth - menu.left)
    : DEFAULT_CAPSULE_RESERVE

  const safeBottom = input.safeArea?.bottom
  const safeAreaBottom =
    typeof safeBottom === 'number' && safeBottom > 0
      ? Math.max(0, input.screenHeight - safeBottom)
      : 0

  return {
    statusBarHeight,
    navBarHeight,
    totalHeight: statusBarHeight + navBarHeight,
    capsuleReserve,
    safeAreaBottom,
  }
}

/** 底部 tab 栏的内容高度（不含安全区） */
export const TAB_BAR_HEIGHT = 50
