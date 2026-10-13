/** Native system input dialog, confirm dialog and action sheet, wrapped in Promises */

/** Prompt for a line of text; returns null on cancel */
export function promptText(options: {
  title: string
  placeholder?: string
  value?: string
  confirmText?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    uni.showModal({
      title: options.title,
      editable: true,
      placeholderText: options.placeholder ?? '',
      content: options.value ?? '',
      confirmText: options.confirmText ?? '确定',
      success: (res) => resolve(res.confirm ? (res.content ?? '').trim() : null),
      fail: () => resolve(null),
    })
  })
}

/** Confirm dialog; the confirm button is red for destructive actions */
export function confirmAction(options: {
  title: string
  content?: string
  confirmText?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: options.title,
      content: options.content ?? '',
      confirmText: options.confirmText ?? '确定',
      confirmColor: options.danger ? '#ff3b30' : undefined,
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    })
  })
}

/** Action sheet; returns the index of the selected item, or -1 on cancel */
export function chooseAction(items: string[]): Promise<number> {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: items,
      success: (res) => resolve(res.tapIndex),
      fail: () => resolve(-1),
    })
  })
}

export function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}
