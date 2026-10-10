<template>
  <view class="rec" :class="{ 'is-visible': visible }" @touchmove.stop.prevent="noop">
    <view class="rec__card">
      <view class="rec__status">
        <view class="rec__dot" />
        <text class="rec__title">正在听你说</text>
      </view>

      <view class="rec__wave">
        <view
          v-for="(level, i) in levels"
          :key="i"
          class="rec__bar"
          :style="`height:${4 + Math.round(level * 40)}px`"
        />
      </view>

      <text class="rec__time sv-en">{{ timeText }}</text>
      <text class="rec__hint" :class="{ 'is-warn': nearLimit }">{{ hint }}</text>

      <view class="rec__actions">
        <view class="rec__action">
          <sv-button type="secondary" block @click="emit('cancel')">取消</sv-button>
        </view>
        <view class="rec__action">
          <sv-button block haptic @click="emit('finish')">
            <sv-icon name="checkmark" :size="18" :weight="2.4" color="var(--sv-text-on-accent)" />
            <text>完成</text>
          </sv-button>
        </view>
      </view>
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
}>()

const emit = defineEmits<{ finish: []; cancel: [] }>()

/** 最后 10 秒提示剩余时间 */
const WARN_SECONDS = 10

const secondsLeft = computed(() =>
  Math.max(0, Math.ceil((LIMITS.recordMaxMs - props.elapsedMs) / 1000)),
)
const nearLimit = computed(() => secondsLeft.value <= WARN_SECONDS)

const timeText = computed(
  () => `${formatDuration(props.elapsedMs)} / ${formatDuration(LIMITS.recordMaxMs)}`,
)

const hint = computed(() =>
  nearLimit.value ? `还可以说 ${secondsLeft.value} 秒` : '说完点「完成」，我来帮你整理',
)

// 录音时挡住背后的页面滚动
function noop() {}
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
    pointer-events: auto;
    transition-delay: 0s;
  }
}

.rec__card {
  width: 300px;
  padding: 24px 20px 20px;
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

.rec__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}

// 录音指示灯，和系统录音的红点一致
.rec__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--sv-danger);
  animation: sv-rec-blink 1.2s var(--sv-ease) infinite;
  animation-play-state: var(--sv-play);
}

.rec__title {
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
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
  transition: height var(--sv-dur-tick) linear;
}

.rec__time {
  margin-top: 16px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--sv-text-2);
}

.rec__hint {
  margin-top: 4px;
  font-size: 14px;
  color: var(--sv-text-2);
  transition: color var(--sv-dur-1) var(--sv-ease);

  &.is-warn {
    color: var(--sv-warning);
    font-weight: 600;
  }
}

.rec__actions {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 22px;
}

.rec__action {
  flex: 1;
}

@keyframes sv-rec-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
</style>
