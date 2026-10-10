<template>
  <view
    class="sv-chip"
    :class="{ 'is-active': active, 'is-disabled': disabled }"
    :hover-class="disabled ? 'none' : 'is-pressed'"
    :hover-stay-time="60"
    @tap="onTap"
  >
    <slot />
  </view>
</template>

<script setup lang="ts">
defineOptions({ options: { virtualHost: true } })

const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), {
  active: false,
  disabled: false,
})

const emit = defineEmits<{ click: [] }>()

function onTap() {
  if (!props.disabled) emit('click')
}
</script>

<style lang="scss">
.sv-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 15px;
  white-space: nowrap;
  color: var(--sv-text);
  background-color: var(--sv-fill);
  transition:
    background-color var(--sv-dur-1) var(--sv-ease),
    color var(--sv-dur-1) var(--sv-ease),
    transform var(--sv-dur-1) var(--sv-ease-spring);

  &.is-active {
    color: var(--sv-text-on-accent);
    background-color: var(--sv-accent);
  }

  &.is-pressed {
    transform: scale(0.95);
  }

  &.is-disabled {
    opacity: 0.4;
  }
}
</style>
