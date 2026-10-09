<template>
  <view class="sv-tabbar" :style="barStyle">
    <view class="sv-tabbar__bg" />
    <view
      v-for="item in items"
      :key="item.key"
      class="sv-tabbar__item"
      :class="{ 'is-active': item.key === modelValue }"
      @tap="select(item.key)"
    >
      <view class="sv-tabbar__icon">
        <sv-icon
          :name="item.key === modelValue ? (item.activeIcon ?? item.icon) : item.icon"
          :size="26"
          :weight="item.key === modelValue ? 2.1 : 1.8"
        />
      </view>
      <text class="sv-tabbar__text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { TAB_BAR_HEIGHT } from '@/utils/layout'
import type { IconName } from '../sv-icon/icons'

export interface TabItem {
  key: string
  text: string
  icon: IconName
  activeIcon?: IconName
}

defineOptions({ options: { virtualHost: true } })

const props = defineProps<{ items: TabItem[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const { metrics } = storeToRefs(useSystemStore())
const barStyle = computed(
  () =>
    `height:${TAB_BAR_HEIGHT + metrics.value.safeAreaBottom}px;` +
    `padding-bottom:${metrics.value.safeAreaBottom}px`,
)

function select(key: string) {
  if (key === props.modelValue) return
  uni.vibrateShort({ type: 'light', fail: () => {} })
  emit('update:modelValue', key)
}
</script>

<style lang="scss">
.sv-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  box-sizing: border-box;
}

.sv-tabbar__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sv-bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid var(--sv-separator);
}

.sv-tabbar__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--sv-text-2);
  transition: color var(--sv-dur-1) var(--sv-ease);

  &.is-active {
    color: var(--sv-accent);
  }
}

.sv-tabbar__icon {
  display: flex;
}

.sv-tabbar__item.is-active .sv-tabbar__icon {
  animation: sv-tab-pop var(--sv-dur-3) var(--sv-ease-spring);
}

.sv-tabbar__text {
  font-size: 10px;
  line-height: 12px;
  font-weight: 500;
}

@keyframes sv-tab-pop {
  0% {
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}
</style>
