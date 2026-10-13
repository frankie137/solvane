<template>
  <button
    class="sv-btn"
    :class="[
      `sv-btn--${type}`,
      `sv-btn--${size}`,
      { 'is-block': block, 'is-disabled': disabled, 'is-loading': loading },
    ]"
    :open-type="openType"
    :disabled="disabled || loading"
    hover-class="is-pressed"
    :hover-stay-time="80"
    @tap="onTap"
  >
    <view v-if="loading" class="sv-btn__spinner" />
    <view class="sv-btn__content">
      <slot />
    </view>
  </button>
</template>

<script setup lang="ts">
import type { ButtonOpenType } from '@uni-helper/uni-app-types'

defineOptions({ options: { virtualHost: true } })

const props = withDefaults(
  defineProps<{
    type?: 'primary' | 'secondary' | 'plain'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    loading?: boolean
    disabled?: boolean
    /** Native open-type capability, e.g. share, chooseAvatar */
    openType?: ButtonOpenType
    /** Light haptic feedback on tap */
    haptic?: boolean
  }>(),
  {
    type: 'primary',
    size: 'md',
    block: false,
    loading: false,
    disabled: false,
    openType: undefined,
    haptic: false,
  },
)

const emit = defineEmits<{ click: [] }>()

function onTap() {
  if (props.disabled || props.loading) return
  if (props.haptic) uni.vibrateShort({ type: 'light', fail: () => {} })
  emit('click')
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.sv-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    transform var(--sv-dur-1) var(--sv-ease-spring),
    opacity var(--sv-dur-1) var(--sv-ease),
    box-shadow var(--sv-dur-2) var(--sv-ease);

  &.is-pressed {
    transform: scale(0.97);
    opacity: 0.85;
  }

  &.is-block {
    display: flex;
    width: 100%;
  }

  &.is-disabled {
    opacity: 0.4;
  }
}

.sv-btn__content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sv-btn--sm {
  // The native button's ::after is hidden by global styles, so the hit area uses ::before
  height: 34px;
  padding: 0 16px;
  font-size: 15px;
  @include sv-hit-area(before);
}

.sv-btn--md {
  height: 44px;
  padding: 0 22px;
  font-size: 17px;
}

.sv-btn--lg {
  height: 54px;
  padding: 0 28px;
  font-size: 17px;
}

.sv-btn--primary {
  background-image: var(--sv-accent-gradient);
  color: var(--sv-text-on-accent);
  box-shadow: var(--sv-shadow-glow);
}

.sv-btn--secondary {
  background-color: var(--sv-fill);
  color: var(--sv-accent);
}

.sv-btn--plain {
  background-color: transparent;
  color: var(--sv-accent);
}

// WeChat's built-in button[disabled]:not([type]) style greys the text and sets the background to #f7f7f7,
// with specificity (0,2,1); three class selectors (0,3,0) override it here
.sv-btn.sv-btn--primary[disabled] {
  color: var(--sv-text-on-accent);
  background-color: transparent;
}

.sv-btn.sv-btn--secondary[disabled] {
  color: var(--sv-accent);
  background-color: var(--sv-fill);
}

.sv-btn.sv-btn--plain[disabled] {
  color: var(--sv-accent);
  background-color: transparent;
}

.sv-btn.is-loading .sv-btn__content {
  opacity: 0.6;
}

.sv-btn__spinner {
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  @include sv-spinning(sv-spin);
}
</style>
