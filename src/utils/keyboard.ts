type KeyboardListener = (res: { height: number }) => void

/** 监听键盘高度；返回取消函数。较老的基础库没有 off 方法时静默跳过 */
export function watchKeyboard(listener: KeyboardListener): () => void {
  wx.onKeyboardHeightChange(listener)
  return () => {
    const off = (wx as { offKeyboardHeightChange?: (l: KeyboardListener) => void })
      .offKeyboardHeightChange
    off?.(listener)
  }
}
