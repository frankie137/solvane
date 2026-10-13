<template>
  <view class="masked">
    <view
      v-for="(s, i) in sentences"
      :key="i"
      class="masked__item"
      :class="{ 'has-divider': i > 0, 'is-active': i === activeSentence }"
      hover-class="is-pressed"
      :hover-stay-time="60"
      @tap="emit('tap-sentence', i)"
    >
      <view class="masked__en sv-en">
        <text
          v-for="(t, j) in tokensOf(i)"
          :key="j"
          class="masked__token"
          :class="`is-level-${levelOf(i)}`"
          >{{ display(t.text, levelOf(i)) }}</text
        >
      </view>
      <view class="masked__foot">
        <text class="masked__zh">{{ s.zh }}</text>
        <text class="masked__hint">{{ HINT_LABEL[levelOf(i)] }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SentencePair } from '@shared/types'
import { firstLetters, tokenize, type HintLevel } from '@/utils/recite'

const props = withDefaults(
  defineProps<{
    sentences: SentencePair[]
    levels: HintLevel[]
    /** Sentence being read aloud; -1 for none */
    activeSentence?: number
  }>(),
  { activeSentence: -1 },
)

const emit = defineEmits<{ 'tap-sentence': [index: number] }>()

/** Tell the user what the next tap will do */
const HINT_LABEL: Record<HintLevel, string> = {
  0: '点一下看首字母',
  1: '再点看整句',
  2: '点一下遮住',
}

const tokens = computed(() => props.sentences.map((s) => tokenize(s.en)))
const tokensOf = (i: number) => tokens.value[i] ?? []
const levelOf = (i: number): HintLevel => props.levels[i] ?? 0

/**
 * When fully masked, still render the original word (transparent text, visible background) so the
 * mask is as long as the text: nothing leaks and nothing jumps
 */
function display(text: string, level: HintLevel): string {
  return level === 1 ? firstLetters(text) : text
}
</script>

<style lang="scss">
.masked__item {
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
}

.masked__en {
  font-size: 18px;
  line-height: 30px;
  font-weight: 600;
}

.masked__token {
  display: inline-block;
  margin-right: 6px;
  padding: 0 1px;
  border-radius: 5px;
  color: var(--sv-text);
  transition:
    color var(--sv-dur-2) var(--sv-ease),
    background-color var(--sv-dur-2) var(--sv-ease);

  &.is-level-0 {
    color: transparent;
    background-color: var(--sv-fill-strong);
  }

  &.is-level-1 {
    color: var(--sv-text-2);
    letter-spacing: 1px;
  }
}

// Sentence being read aloud: light accent background for the whole sentence, revealed words in the
// accent color, masked blocks unchanged
.masked__item.is-active .masked__token:not(.is-level-0) {
  color: var(--sv-accent);
}

.masked__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.masked__zh {
  flex: 1;
  font-size: 15px;
  line-height: 21px;
  color: var(--sv-text-2);
}

.masked__hint {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--sv-text-3);
}
</style>
