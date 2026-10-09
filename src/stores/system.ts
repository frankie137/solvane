import { defineStore } from 'pinia'
import { ref } from 'vue'
import { computeNavMetrics, type NavMetrics } from '@/utils/layout'

function readMetrics(): NavMetrics {
  const win = uni.getWindowInfo()
  let menuButton: UniApp.GetMenuButtonBoundingClientRectRes | null = null
  try {
    menuButton = uni.getMenuButtonBoundingClientRect()
  } catch {
    menuButton = null
  }
  return computeNavMetrics({
    statusBarHeight: win.statusBarHeight,
    windowWidth: win.windowWidth,
    screenHeight: win.screenHeight,
    safeArea: win.safeArea,
    menuButton,
  })
}

/** 设备与布局信息：启动时读一次，所有页面共享 */
export const useSystemStore = defineStore('system', () => {
  const metrics = ref<NavMetrics>(readMetrics())
  return { metrics }
})
