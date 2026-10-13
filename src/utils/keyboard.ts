type KeyboardListener = (res: { height: number }) => void

/** Listen for keyboard height; returns an unsubscribe function. Silently skips on older base libraries without the off method */
export function watchKeyboard(listener: KeyboardListener): () => void {
  wx.onKeyboardHeightChange(listener)
  return () => {
    const off = (wx as { offKeyboardHeightChange?: (l: KeyboardListener) => void })
      .offKeyboardHeightChange
    off?.(listener)
  }
}
