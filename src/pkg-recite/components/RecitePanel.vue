<template>
  <view class="panel" :style="panelStyle">
    <view class="panel__bg" />

    <view v-if="submitting" class="panel__body">
      <view class="panel__spinner" />
      <text class="panel__status">正在上传录音…</text>
    </view>

    <view v-else-if="recording" class="panel__body">
      <view class="panel__wave">
        <view
          v-for="(level, i) in levels"
          :key="i"
          class="panel__bar"
          :style="`height:${4 + Math.round(level * 32)}px`"
        />
      </view>
      <text class="panel__time sv-en" :class="{ 'is-warn': nearLimit }">{{ timeText }}</text>
      <view class="panel__actions">
        <view class="panel__action">
          <sv-button type="secondary" block @click="emit('cancel')">取消</sv-button>
        </view>
        <view class="panel__action">
          <sv-button block haptic @click="emit('finish')">
            <sv-icon name="checkmark" :size="18" :weight="2.4" color="var(--sv-text-on-accent)" />
            <text>背完了</text>
          </sv-button>
        </view>
      </view>
    </view>

    <view v-else class="panel__body">
      <view class="panel__mic" hover-class="is-pressed" :hover-stay-time="80" @tap="emit('start')">
        <sv-icon name="mic.fill" :size="30" color="var(--sv-text-on-accent)" :weight="2" />
      </view>
      <text class="panel__status">点一下开始背诵 · 最长 60 秒</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { LIMITS } from '@shared/constants'
import { useSystemStore } from '@/stores/system'
import { formatDuration } from '@/utils/audio'

const props = defineProps<{
  recording: boolean
  submitting: boolean
  levels: number[]
  elapsedMs: number
}>()

const emit = defineEmits<{ start: []; finish: []; cancel: [] }>()

const { metrics } = storeToRefs(useSystemStore())
const panelStyle = computed(() => `padding-bottom:${metrics.value.safeAreaBottom + 12}px`)

const secondsLeft = computed(() =>
  Math.max(0, Math.ceil((LIMITS.reciteMaxMs - props.elapsedMs) / 1000)),
)
const nearLimit = computed(() => secondsLeft.value <= 10)
const timeText = computed(() =>
  nearLimit.value
    ? `还可以说 ${secondsLeft.value} 秒`
    : `${formatDuration(props.elapsedMs)} / ${formatDuration(LIMITS.reciteMaxMs)}`,
)
</script>

<style lang="scss">
.panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  padding-top: 14px;
}

.panel__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sv-bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid var(--sv-separator);
}

.panel__body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
}

.panel__mic {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: var(--sv-accent-gradient);
  box-shadow: 0 8px 24px var(--sv-accent-glow);
  transition: transform var(--sv-dur-2) var(--sv-ease-spring);

  &.is-pressed {
    transform: scale(0.94);
  }
}

.panel__status {
  font-size: 14px;
  color: var(--sv-text-2);
}

.panel__wave {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 40px;
}

.panel__bar {
  width: 4px;
  border-radius: 2px;
  background-color: var(--sv-accent);
  transition: height 80ms linear;
}

.panel__time {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--sv-text-2);

  &.is-warn {
    color: var(--sv-warning);
    font-weight: 600;
  }
}

.panel__actions {
  display: flex;
  gap: 12px;
  width: 100%;
}

.panel__action {
  flex: 1;
}

.panel__spinner {
  width: 24px;
  height: 24px;
  margin: 12px 0 2px;
  box-sizing: border-box;
  border: 3px solid var(--sv-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: sv-panel-spin 0.8s linear infinite;
  animation-play-state: var(--sv-play);
}

@keyframes sv-panel-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
