<template>
  <view class="sv-skeleton">
    <view v-if="title" class="sv-skeleton__line sv-skeleton__line--title" />
    <view
      v-for="(width, i) in widths"
      :key="i"
      class="sv-skeleton__line"
      :style="`width:${width}`"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ options: { virtualHost: true } })

const props = withDefaults(defineProps<{ rows?: number; title?: boolean }>(), {
  rows: 3,
  title: false,
})

// 行宽错落，最后一行短一些，看起来更像真实段落
const PATTERN = ['100%', '92%', '96%', '84%']
const widths = computed(() =>
  Array.from({ length: props.rows }, (_, i) =>
    i === props.rows - 1 && props.rows > 1 ? '58%' : PATTERN[i % PATTERN.length],
  ),
)
</script>

<style lang="scss">
.sv-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sv-skeleton__line {
  height: 14px;
  border-radius: 7px;
  background-image: linear-gradient(
    90deg,
    var(--sv-fill) 0%,
    var(--sv-fill-strong) 50%,
    var(--sv-fill) 100%
  );
  background-size: 300% 100%;
  animation: sv-shimmer 1.6s var(--sv-ease) infinite;
  animation-play-state: var(--sv-play);
}

.sv-skeleton__line--title {
  width: 42%;
  height: 20px;
  border-radius: 10px;
  margin-bottom: 4px;
}

@keyframes sv-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
</style>
