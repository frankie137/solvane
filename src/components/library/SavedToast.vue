<template>
  <view class="saved" :class="{ 'is-shown': show }" :style="`bottom:${bottom}px`">
    <view class="saved__pill">
      <sv-icon name="bookmark.fill" :size="15" color="var(--sv-accent)" />
      <text class="saved__text">{{ text }}</text>
      <view v-if="action" class="saved__action" hover-class="is-pressed" @tap="emit('action')">
        <text>{{ action }}</text>
        <sv-icon name="chevron.right" :size="13" :weight="2.4" color="var(--sv-accent)" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ show: boolean; text: string; action?: string; bottom?: number }>(), {
  action: '',
  bottom: 32,
})
const emit = defineEmits<{ action: [] }>()
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.saved {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 250;
  display: flex;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity var(--sv-dur-2) var(--sv-ease),
    transform var(--sv-dur-2) var(--sv-ease-spring);

  &.is-shown {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}

.saved__pill {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 16px;
  border-radius: 22px;
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-float);
}

.saved__text {
  font-size: 15px;
  font-weight: 600;
}

.saved__action {
  @include sv-hit-area;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 10px;
  border-radius: 16px;
  font-size: 14px;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);

  &.is-pressed {
    opacity: 0.6;
  }
}
</style>
