<template>
  <view v-if="rendered" class="sv-sheet" :class="{ 'is-open': visible }">
    <view class="sv-sheet__mask" @tap="onMaskTap" @touchmove.stop.prevent="noop" />
    <view class="sv-sheet__panel" :style="panelStyle">
      <view class="sv-sheet__grabber" />
      <view v-if="title" class="sv-sheet__header">
        <text class="sv-sheet__title">{{ title }}</text>
        <view class="sv-sheet__close" hover-class="is-pressed" @tap="close">
          <sv-icon name="xmark" :size="16" :weight="2.4" />
        </view>
      </view>
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { watchKeyboard } from '@/utils/keyboard'

defineOptions({ options: { virtualHost: true, styleIsolation: 'apply-shared' } })

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    /** 点遮罩是否关闭 */
    maskClosable?: boolean
  }>(),
  { title: '', maskClosable: true },
)

const emit = defineEmits<{ 'update:show': [value: boolean]; closed: [] }>()

/** 与 tokens.scss 里的 --sv-dur-3 保持一致 */
const ANIMATION_MS = 450

const { metrics } = storeToRefs(useSystemStore())
const rendered = ref(props.show)
const visible = ref(props.show)
const keyboardHeight = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null
let unwatchKeyboard: (() => void) | null = null

const panelStyle = computed(() => {
  const keyboard = keyboardHeight.value
  // 键盘弹起时贴着键盘，不再留安全区
  const padding = keyboard > 0 ? 12 : Math.max(metrics.value.safeAreaBottom, 12)
  // 键盘偏移用 bottom、打开关闭用 transform，两者各自过渡，互不干扰
  const transform = visible.value ? 'translateY(0)' : 'translateY(100%)'
  return `padding-bottom:${padding}px;bottom:${keyboard}px;transform:${transform}`
})

function onKeyboard(res: { height: number }) {
  // 打中文时候选栏出现 / 消失会反复触发，值没变就不更新
  if (res.height !== keyboardHeight.value) keyboardHeight.value = res.height
}

watch(
  () => props.show,
  (show) => {
    if (timer) clearTimeout(timer)
    if (show) {
      rendered.value = true
      unwatchKeyboard ??= watchKeyboard(onKeyboard)
      // 先渲染到起始位置，下一帧再加 is-open，过渡动画才会生效
      timer = setTimeout(() => (visible.value = true), 30)
    } else {
      visible.value = false
      keyboardHeight.value = 0
      unwatchKeyboard?.()
      unwatchKeyboard = null
      timer = setTimeout(() => {
        rendered.value = false
        emit('closed')
      }, ANIMATION_MS)
    }
  },
)

function close() {
  emit('update:show', false)
}

function onMaskTap() {
  if (props.maskClosable) close()
}

function noop() {}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  unwatchKeyboard?.()
})
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.sv-sheet {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 300;
}

.sv-sheet__mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sv-scrim);
  opacity: 0;
  transition: opacity var(--sv-dur-2) var(--sv-ease);
}

.sv-sheet.is-open .sv-sheet__mask {
  opacity: 1;
}

.sv-sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  max-height: 88vh;
  padding: 0 20px;
  border-radius: var(--sv-radius-l) var(--sv-radius-l) 0 0;
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-float);
  // 跟随键盘要快（和系统键盘动画同步），打开关闭可以慢一点
  transition:
    transform var(--sv-dur-3) var(--sv-ease),
    bottom var(--sv-dur-keyboard) var(--sv-ease-out);
}

.sv-sheet__grabber {
  width: 36px;
  height: 5px;
  margin: 8px auto 4px;
  border-radius: 3px;
  background-color: var(--sv-fill-strong);
}

.sv-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 12px;
}

.sv-sheet__title {
  font-size: 20px;
  line-height: 25px;
  font-weight: 600;
}

.sv-sheet__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sv-text-2);
  background-color: var(--sv-fill);
  transition: opacity var(--sv-dur-1) var(--sv-ease);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.6;
  }
}
</style>
