<template>
  <view class="sv-group">
    <text v-if="header" class="sv-group__header">{{ header }}</text>
    <view class="sv-group__body">
      <slot />
    </view>
    <text v-if="footer" class="sv-group__footer">{{ footer }}</text>
  </view>
</template>

<script setup lang="ts">
defineOptions({ options: { virtualHost: true } })

withDefaults(defineProps<{ header?: string; footer?: string }>(), { header: '', footer: '' })
</script>

<style lang="scss">
.sv-group__header,
.sv-group__footer {
  display: block;
  padding: 0 16px;
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-text-2);
}

.sv-group__header {
  margin-bottom: 7px;
}

.sv-group__footer {
  margin-top: 7px;
}

.sv-group__body {
  overflow: hidden;
  border-radius: var(--sv-radius-m);
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-card);
}
</style>
