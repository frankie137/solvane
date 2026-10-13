/** Sizes for the custom nav bar: status bar + a nav area vertically centered with the capsule button */
export interface NavMetrics {
  statusBarHeight: number
  /** Nav area height (excluding the status bar) */
  navBarHeight: number
  /** Status bar + nav area */
  totalHeight: number
  /** Width reserved on the right for the capsule button */
  capsuleReserve: number
  /** Bottom safe-area height (home indicator on full-screen devices) */
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
  // Some devices and WeChat DevTools return all-zero capsule info; fall back to defaults then
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

/** Content height of the bottom tab bar (excluding the safe area) */
export const TAB_BAR_HEIGHT = 50
