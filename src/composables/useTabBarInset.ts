import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { TAB_BAR_HEIGHT } from '@/utils/layout'

/** tab 页底部需要留出的空白，避免内容被 tab 栏挡住 */
export function useTabBarInset(extra = 24) {
  const { metrics } = storeToRefs(useSystemStore())
  return computed(() => `height:${TAB_BAR_HEIGHT + metrics.value.safeAreaBottom + extra}px`)
}
