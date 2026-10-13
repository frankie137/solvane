import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { TAB_BAR_HEIGHT } from '@/utils/layout'

/** Bottom spacing for tab pages so content isn't hidden behind the tab bar */
export function useTabBarInset(extra = 24) {
  const { metrics } = storeToRefs(useSystemStore())
  return computed(() => `height:${TAB_BAR_HEIGHT + metrics.value.safeAreaBottom + extra}px`)
}
