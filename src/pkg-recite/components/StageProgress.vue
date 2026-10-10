<template>
  <view class="stages">
    <view v-for="(s, i) in STAGES" :key="s.id" class="stage" :class="`is-${stateOf(i)}`">
      <view class="stage__mark">
        <sv-icon
          v-if="stateOf(i) === 'done'"
          name="checkmark"
          :size="14"
          :weight="2.8"
          color="var(--sv-text-on-accent)"
        />
        <view v-else-if="stateOf(i) === 'running'" class="stage__spinner" />
      </view>
      <text class="stage__label">{{ s.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { PracticeStage } from '@shared/types'

const props = defineProps<{ stage: PracticeStage; failed: boolean }>()

const STAGES: { id: PracticeStage; label: string }[] = [
  { id: 'transcribe', label: '识别你说的话' },
  { id: 'align', label: '对照原文' },
  { id: 'score', label: '评测发音' },
  { id: 'report', label: '生成建议' },
]

function stateOf(i: number): 'done' | 'running' | 'failed' | 'pending' {
  const current =
    props.stage === 'done' ? STAGES.length : STAGES.findIndex((s) => s.id === props.stage)
  if (i < current) return 'done'
  if (i === current) return props.failed ? 'failed' : 'running'
  return 'pending'
}
</script>

<style lang="scss">
.stages {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stage {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--sv-text-3);
  transition: color var(--sv-dur-2) var(--sv-ease);

  &.is-done,
  &.is-running {
    color: var(--sv-text);
  }

  &.is-failed {
    color: var(--sv-danger);
  }
}

.stage__mark {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--sv-fill-strong);
  box-sizing: border-box;
  transition:
    background-color var(--sv-dur-2) var(--sv-ease),
    border-color var(--sv-dur-2) var(--sv-ease);
}

.stage.is-done .stage__mark {
  border-color: var(--sv-accent);
  background-color: var(--sv-accent);
}

.stage.is-running .stage__mark {
  border-color: transparent;
}

.stage.is-failed .stage__mark {
  border-color: var(--sv-danger);
}

.stage__spinner {
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border: 2.5px solid var(--sv-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: sv-stage-spin 0.8s linear infinite;
  animation-play-state: var(--sv-play);
}

.stage__label {
  font-size: 16px;
  line-height: 22px;
}

@keyframes sv-stage-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
