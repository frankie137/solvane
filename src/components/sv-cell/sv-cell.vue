<template>
  <view
    class="sv-cell"
    :hover-class="clickable ? 'is-pressed' : 'none'"
    :hover-stay-time="60"
    @tap="onTap"
  >
    <view v-if="icon" class="sv-cell__icon" :style="`background:${iconBg}`">
      <sv-icon :name="icon" :size="18" color="#fff" :weight="2" />
    </view>
    <view class="sv-cell__main" :class="{ 'has-divider': divider }">
      <text class="sv-cell__title">{{ title }}</text>
      <view class="sv-cell__trail">
        <slot name="value">
          <text v-if="value" class="sv-cell__value">{{ value }}</text>
        </slot>
        <sv-icon
          v-if="arrow"
          name="chevron.right"
          :size="16"
          :weight="2.2"
          class="sv-cell__arrow"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { IconName } from '../sv-icon/icons'

defineOptions({ options: { virtualHost: true } })

const props = withDefaults(
  defineProps<{
    title: string
    value?: string
    icon?: IconName
    /** 图标底色，参考 iOS 设置页的彩色方块 */
    iconBg?: string
    arrow?: boolean
    clickable?: boolean
    /** 组内最后一项传 false，去掉底部分隔线 */
    divider?: boolean
  }>(),
  {
    value: '',
    icon: undefined,
    iconBg: 'var(--sv-accent)',
    arrow: false,
    clickable: false,
    divider: true,
  },
)

const emit = defineEmits<{ click: [] }>()

function onTap() {
  if (props.clickable) emit('click')
}
</script>

<style lang="scss">
.sv-cell {
  display: flex;
  align-items: center;
  min-height: 50px;
  padding-left: 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.sv-cell__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-right: 14px;
  border-radius: 8px;
  flex-shrink: 0;
}

.sv-cell__main {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  align-self: stretch;
  min-height: 50px;
  padding-right: 16px;

  &.has-divider::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }
}

.sv-cell__title {
  font-size: 17px;
  line-height: 22px;
}

.sv-cell__trail {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
  color: var(--sv-text-2);
}

.sv-cell__value {
  font-size: 17px;
  line-height: 22px;
  color: var(--sv-text-2);
}

.sv-cell__arrow {
  color: var(--sv-text-3);
}
</style>
