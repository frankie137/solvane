<template>
  <view class="sentences" :style="`--locate-ms:${LOCATE_HIGHLIGHT_MS}ms`">
    <view
      v-for="(s, i) in sentences"
      :key="i"
      class="sentence"
      :class="{
        'has-divider': i > 0,
        'is-active': i === activeSentence,
        'is-located': i === located,
      }"
      :hover-class="interactive ? 'is-pressed' : 'none'"
      :hover-stay-time="60"
      @tap="onTap(i)"
      @longpress="onHold(i)"
    >
      <text class="sentence__en sv-en">{{ s.en }}</text>
      <text class="sentence__zh">{{ s.zh }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { SentencePair } from '@shared/types'
import { LOCATE_HIGHLIGHT_MS } from '../constants'

const props = withDefaults(
  defineProps<{
    sentences: SentencePair[]
    /** Sentence being read aloud; -1 for none */
    activeSentence?: number
    /** Tap a sentence to replay it alone; long-press to pick words to save */
    interactive?: boolean
    /** Sentence to highlight when arriving from a saved item; -1 for none */
    located?: number
  }>(),
  { activeSentence: -1, interactive: false, located: -1 },
)

const emit = defineEmits<{ select: [index: number]; hold: [index: number] }>()

function onTap(i: number) {
  if (props.interactive) emit('select', i)
}

function onHold(i: number) {
  if (!props.interactive) return
  uni.vibrateShort({ type: 'light', fail: () => {} })
  emit('hold', i)
}
</script>

<style lang="scss">
.sentence {
  position: relative;
  padding: 14px 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }

  &.is-active {
    background-color: var(--sv-accent-soft);
  }

  &.is-active .sentence__en {
    color: var(--sv-accent);
  }

  &.is-located {
    animation: sentence-located var(--locate-ms) var(--sv-ease) 1;
  }
}

@keyframes sentence-located {
  0%,
  60% {
    background-color: var(--sv-accent-soft);
  }

  100% {
    background-color: transparent;
  }
}

.sentence__en {
  display: block;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
  color: var(--sv-text);
  transition: color var(--sv-dur-1) var(--sv-ease);
}

.sentence__zh {
  display: block;
  margin-top: 4px;
  font-size: 15px;
  line-height: 21px;
  color: var(--sv-text-2);
}
</style>
