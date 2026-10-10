/** 系统原生的输入框、确认框和操作菜单，包装成 Promise */

/** 输入一行文字；取消返回 null */
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

/** 确认框；危险操作的确认按钮显示为红色 */
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

/** 底部操作菜单；返回选中项的序号，取消返回 -1 */
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
