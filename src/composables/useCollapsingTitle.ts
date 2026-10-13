import { ref } from 'vue'

/** Scroll threshold for collapsing the large title, roughly the large title's height */
const COLLAPSE_AT = 36

/**
 * Track the scroll position to decide whether the large title is collapsed.
 * Update state only when crossing the threshold, so not every scroll event triggers setData.
 */
export function useCollapsingTitle() {
  const collapsed = ref(false)

  function onScroll(e: { detail: { scrollTop: number } }) {
    const next = e.detail.scrollTop > COLLAPSE_AT
    if (next !== collapsed.value) collapsed.value = next
  }

  return { collapsed, onScroll }
}
