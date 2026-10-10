<template>
  <view class="switch">
    <view class="switch__thumb" :class="{ 'is-right': modelValue === 'session' }" />
    <view
      v-for="item in ITEMS"
      :key="item.key"
      class="switch__item"
      :class="{ 'is-active': modelValue === item.key }"
      @tap="select(item.key)"
    >
      <text>{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { LibraryTab } from '@shared/types'

const ITEMS: { key: LibraryTab; text: string }[] = [
  { key: 'expression', text: '表达' },
  { key: 'session', text: '对话' },
]

const props = defineProps<{ modelValue: LibraryTab }>()
const emit = defineEmits<{ 'update:modelValue': [value: LibraryTab] }>()

function select(key: LibraryTab) {
  if (key === props.modelValue) return
  uni.vibrateShort({ type: 'light', fail: () => {} })
  emit('update:modelValue', key)
}
</script>

<style lang="scss">
.switch {
  position: relative;
  display: flex;
  height: 36px;
  padding: 2px;
  border-radius: 10px;
  background-color: var(--sv-fill);
}

.switch__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc(50% - 2px);
  border-radius: 8px;
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-card);
  transition: transform var(--sv-dur-2) var(--sv-ease);

  &.is-right {
    transform: translateX(100%);
  }
}

.switch__item {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--sv-text-2);
  transition: color var(--sv-dur-1) var(--sv-ease);

  &.is-active {
    font-weight: 600;
    color: var(--sv-text);
  }
}
</style>
