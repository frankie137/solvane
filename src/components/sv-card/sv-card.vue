<template>
  <view class="sv-card" :class="`sv-card--${radius}`" :style="`padding:${padding}px`">
    <view v-if="title" class="sv-card__header">
      <text class="sv-headline">{{ title }}</text>
      <slot name="extra" />
    </view>
    <slot />
  </view>
</template>

<script setup lang="ts">
defineOptions({ options: { virtualHost: true, styleIsolation: 'apply-shared' } })

withDefaults(
  defineProps<{
    title?: string
    padding?: number
    radius?: 's' | 'm' | 'l'
  }>(),
  { title: '', padding: 20, radius: 'l' },
)
</script>

<style lang="scss">
.sv-card {
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-card);
  box-sizing: border-box;
}

.sv-card--s {
  border-radius: var(--sv-radius-s);
}

.sv-card--m {
  border-radius: var(--sv-radius-m);
}

.sv-card--l {
  border-radius: var(--sv-radius-l);
}

.sv-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
</style>
