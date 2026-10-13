// easycom registers sv-* components at compile time; declaring them here lets type checking validate their props in templates.
// When adding an sv-* component, add a line here too (src/components.test.ts checks for missing entries).
export {}

declare module 'vue' {
  interface GlobalComponents {
    SvButton: (typeof import('./components/sv-button/sv-button.vue'))['default']
    SvCard: (typeof import('./components/sv-card/sv-card.vue'))['default']
    SvCell: (typeof import('./components/sv-cell/sv-cell.vue'))['default']
    SvChip: (typeof import('./components/sv-chip/sv-chip.vue'))['default']
    SvField: (typeof import('./components/sv-field/sv-field.vue'))['default']
    SvGroup: (typeof import('./components/sv-group/sv-group.vue'))['default']
    SvIcon: (typeof import('./components/sv-icon/sv-icon.vue'))['default']
    SvNavBar: (typeof import('./components/sv-nav-bar/sv-nav-bar.vue'))['default']
    SvSheet: (typeof import('./components/sv-sheet/sv-sheet.vue'))['default']
    SvSkeleton: (typeof import('./components/sv-skeleton/sv-skeleton.vue'))['default']
    SvState: (typeof import('./components/sv-state/sv-state.vue'))['default']
    SvTabBar: (typeof import('./components/sv-tab-bar/sv-tab-bar.vue'))['default']
  }
}
