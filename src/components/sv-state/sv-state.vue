<template>
  <view class="sv-state">
    <view class="sv-state__icon" :class="`is-${tone}`">
      <sv-icon :name="icon" :size="26" />
    </view>
    <text class="sv-state__title">{{ title }}</text>
    <text v-if="description" class="sv-state__desc">{{ description }}</text>
    <slot />
  </view>
</template>

<script setup lang="ts">
import type { IconName } from '../sv-icon/icons'

defineOptions({ options: { virtualHost: true } })

withDefaults(
  defineProps<{
    icon: IconName
    title: string
    description?: string
    tone?: 'accent' | 'danger'
  }>(),
  { description: '', tone: 'accent' },
)
</script>

<style lang="scss">
.sv-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  text-align: center;
}

.sv-state__icon {
  width: 52px;
  height: 52px;
  margin-bottom: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &.is-accent {
    color: var(--sv-accent);
    background-color: var(--sv-accent-soft);
  }

  &.is-danger {
    color: var(--sv-danger);
    background-color: var(--sv-fill);
  }
}

.sv-state__title {
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
}

.sv-state__desc {
  max-width: 280px;
  margin-bottom: 8px;
  font-size: 15px;
  line-height: 20px;
  color: var(--sv-text-2);
}
</style>
