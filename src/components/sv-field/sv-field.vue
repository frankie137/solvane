<template>
  <view class="sv-field" :class="{ 'has-divider': divider }">
    <text class="sv-field__label">{{ label }}</text>
    <input
      class="sv-field__input"
      :value="modelValue"
      :placeholder="placeholder"
      placeholder-class="sv-field__placeholder"
      :password="password"
      :maxlength="maxlength"
      :disabled="disabled"
      confirm-type="done"
      @input="onInput"
    />
  </view>
</template>

<script setup lang="ts">
defineOptions({ options: { virtualHost: true } })

withDefaults(
  defineProps<{
    label: string
    modelValue: string
    placeholder?: string
    password?: boolean
    maxlength?: number
    disabled?: boolean
    divider?: boolean
  }>(),
  { placeholder: '', password: false, maxlength: 300, disabled: false, divider: true },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(e: { detail: { value: string } }) {
  emit('update:modelValue', e.detail.value)
}
</script>

<style lang="scss">
.sv-field {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 50px;
  padding: 0 16px;

  &.has-divider::after {
    content: '';
    position: absolute;
    left: 16px;
    right: 0;
    bottom: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }
}

.sv-field__label {
  flex-shrink: 0;
  width: 84px;
  font-size: 17px;
  line-height: 22px;
}

.sv-field__input {
  flex: 1;
  height: 50px;
  font-size: 17px;
  color: var(--sv-text);
  text-align: right;
}

.sv-field__placeholder {
  color: var(--sv-text-3);
}
</style>
