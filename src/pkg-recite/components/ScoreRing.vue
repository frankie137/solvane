<template>
  <view class="ring" :style="ringStyle">
    <view class="ring__inner">
      <text class="ring__value sv-en">{{ shown }}</text>
      <text class="ring__label">{{ label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { scoreTone } from '@/utils/recite'

const props = defineProps<{ score: number }>()

/** 分数从 0 数到目标值，约 0.6 秒 */
const shown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

watch(
  () => props.score,
  (target) => {
    if (timer) clearInterval(timer)
    const start = Date.now()
    timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 600)
      // 先快后慢
      shown.value = Math.round(target * (1 - (1 - t) ** 3))
      if (t >= 1 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 16)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const TONE_COLOR = {
  good: 'var(--sv-success)',
  fair: 'var(--sv-warning)',
  poor: 'var(--sv-danger)',
  none: 'var(--sv-text-3)',
} as const

const ringStyle = computed(() => {
  const color = TONE_COLOR[scoreTone(props.score)]
  const deg = Math.round((shown.value / 100) * 360)
  return `background:conic-gradient(${color} ${deg}deg, var(--sv-fill) ${deg}deg)`
})

const label = computed(() => {
  if (props.score >= 90) return '非常棒'
  if (props.score >= 80) return '很不错'
  if (props.score >= 60) return '继续加油'
  return '再练练'
})
</script>

<style lang="scss">
.ring {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring__inner {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--sv-surface);
}

.ring__value {
  font-size: 40px;
  line-height: 44px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ring__label {
  font-size: 13px;
  color: var(--sv-text-2);
}
</style>
