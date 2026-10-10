/** 跳转锁：上一次跳转还没完成时忽略新的跳转，防止连点压两层同一个页面 */
let navigating = false
/** 个别情况下 complete 不回调，最多锁这么久 */
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
      // 新页面出现前还有一点动画时间，稍等再解锁
      setTimeout(() => {
        navigating = false
      }, 300)
    },
  })
}
