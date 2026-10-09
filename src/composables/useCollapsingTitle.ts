import { ref } from 'vue'

/** 大标题收起的滚动阈值，约等于大标题的高度 */
const COLLAPSE_AT = 36

/**
 * 跟踪滚动位置决定大标题是否收起。
 * 只在越过阈值时更新状态，避免每次滚动事件都触发 setData。
 */
export function useCollapsingTitle() {
  const collapsed = ref(false)

  function onScroll(e: { detail: { scrollTop: number } }) {
    const next = e.detail.scrollTop > COLLAPSE_AT
    if (next !== collapsed.value) collapsed.value = next
  }

  return { collapsed, onScroll }
}
