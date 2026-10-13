/** Navigation lock: ignore new navigations while the previous one is pending, so double taps don't push the same page twice */
let navigating = false
/** complete occasionally never fires, so lock for at most this long */
const LOCK_MS = 800

export function navigateTo(url: string): void {
  if (navigating) return
  navigating = true
  const timer = setTimeout(() => {
    navigating = false
  }, LOCK_MS)
  uni.navigateTo({
    url,
    complete: () => {
      clearTimeout(timer)
      // There's a bit of animation before the new page appears; wait a moment before unlocking
      setTimeout(() => {
        navigating = false
      }, 300)
    },
  })
}
