<template>
  <view class="sentences">
    <view v-for="(s, i) in sentences" :key="i" class="sentence" :class="{ 'has-divider': i > 0 }">
      <text class="sentence__en sv-en">{{ s.en }}</text>
      <text class="sentence__zh">{{ s.zh }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { SentencePair } from '@shared/types'

defineProps<{ sentences: SentencePair[] }>()
</script>

<style lang="scss">
.sentence {
  position: relative;
  padding: 14px 16px;

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 0.5px;
    background-color: var(--sv-separator);
  }
}

.sentence__en {
  display: block;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
  color: var(--sv-text);
}

.sentence__zh {
  display: block;
  margin-top: 4px;
  font-size: 15px;
  line-height: 21px;
  color: var(--sv-text-2);
}
</style>
