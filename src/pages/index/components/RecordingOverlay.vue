<template>
  <view class="rec" :class="{ 'is-visible': visible, 'is-cancel': cancelArmed }">
    <view class="rec__card">
      <view class="rec__wave">
        <view
          v-for="(level, i) in levels"
          :key="i"
          class="rec__bar"
          :style="`height:${4 + Math.round(level * 40)}px`"
        />
      </view>
      <text class="rec__time sv-en">{{ timeText }}</text>
      <text class="rec__hint">{{ hint }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LIMITS } from '@shared/constants'
import { formatDuration } from '@/utils/audio'

const props = defineProps<{
  visible: boolean
  levels: number[]
  elapsedMs: number
  cancelArmed: boolean
}>()

const timeText = computed(
  () => `${formatDuration(props.elapsedMs)} / ${formatDuration(LIMITS.recordMaxMs)}`,
)

const hint = computed(() => {
  if (props.cancelArmed) return '松开手指，取消录音'
  const left = Math.ceil((LIMITS.recordMaxMs - props.elapsedMs) / 1000)
  if (left <= 10) return `还可以说 ${Math.max(left, 0)} 秒`
  return '松开结束 · 上滑取消'
})
</script>

<style lang="scss">
.rec {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--sv-scrim-soft);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity var(--sv-dur-2) var(--sv-ease),
    visibility 0s linear var(--sv-dur-2);

  &.is-visible {
    opacity: 1;
    visibility: visible;
    transition-delay: 0s;
  }
}

.rec__card {
  width: 260px;
  padding: 28px 20px 22px;
  border-radius: var(--sv-radius-l);
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-float);
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: scale(0.92);
  transition: transform var(--sv-dur-3) var(--sv-ease-spring);
}

.rec.is-visible .rec__card {
  transform: scale(1);
}

.rec__wave {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 48px;
}

.rec__bar {
  width: 4px;
  border-radius: 2px;
  background-color: var(--sv-accent);
  transition:
    height 80ms linear,
    background-color var(--sv-dur-1) var(--sv-ease);
}

.rec.is-cancel .rec__bar {
  background-color: var(--sv-danger);
}

.rec__time {
  margin-top: 16px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--sv-text-2);
}

.rec__hint {
  margin-top: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sv-text);
  transition: color var(--sv-dur-1) var(--sv-ease);
}

.rec.is-cancel .rec__hint {
  color: var(--sv-danger);
}
</style>
