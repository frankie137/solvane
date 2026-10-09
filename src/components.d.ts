// easycom 在编译时自动注册 sv-* 组件，这里把它们登记给类型检查，模板里的属性才能被校验。
// 新增 sv-* 组件时要同步在这里加一行（src/components.test.ts 会校验有没有漏登记）。
export {}

declare module 'vue' {
  interface GlobalComponents {
    SvButton: (typeof import('./components/sv-button/sv-button.vue'))['default']
    SvCard: (typeof import('./components/sv-card/sv-card.vue'))['default']
    SvCell: (typeof import('./components/sv-cell/sv-cell.vue'))['default']
    SvGroup: (typeof import('./components/sv-group/sv-group.vue'))['default']
    SvIcon: (typeof import('./components/sv-icon/sv-icon.vue'))['default']
    SvNavBar: (typeof import('./components/sv-nav-bar/sv-nav-bar.vue'))['default']
    SvSkeleton: (typeof import('./components/sv-skeleton/sv-skeleton.vue'))['default']
    SvTabBar: (typeof import('./components/sv-tab-bar/sv-tab-bar.vue'))['default']
  }
}
