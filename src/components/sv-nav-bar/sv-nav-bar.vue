<template>
  <view class="sv-nav">
    <view class="sv-nav__bar" :class="{ 'is-solid': solid }" :style="barStyle">
      <view class="sv-nav__bg" />
      <view class="sv-nav__inner" :style="innerStyle">
        <view
          v-if="back"
          class="sv-nav__back"
          :style="backStyle"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="goBack"
        >
          <sv-icon name="chevron.left" :size="26" :weight="2.2" />
        </view>
        <text class="sv-nav__title sv-headline" :class="{ 'is-visible': solid }">{{ title }}</text>
      </view>
    </view>

    <!-- 固定导航栏的占位，让内容从导航栏下方开始 -->
    <view :style="spacerStyle" />

    <view v-if="large" class="sv-nav__large" :class="{ 'is-collapsed': collapsed }">
      <text class="sv-large-title">{{ title }}</text>
      <slot name="trailing" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'

defineOptions({ options: { virtualHost: true, styleIsolation: 'apply-shared' } })

const props = withDefaults(
  defineProps<{
    title: string
    /** 大标题模式：标题先以大字号显示在内容顶部，滚动后收进导航栏 */
    large?: boolean
    /** 大标题模式下是否已经滚动收起，由页面根据滚动位置传入 */
    collapsed?: boolean
    back?: boolean
  }>(),
  { large: true, collapsed: false, back: false },
)

const { metrics } = storeToRefs(useSystemStore())

const solid = computed(() => !props.large || props.collapsed)

const barStyle = computed(
  () => `height:${metrics.value.totalHeight}px;padding-top:${metrics.value.statusBarHeight}px`,
)
// 左右对称留出胶囊按钮的宽度，保证标题真正居中
const innerStyle = computed(
  () => `height:${metrics.value.navBarHeight}px;padding:0 ${metrics.value.capsuleReserve}px`,
)
const backStyle = computed(() => `height:${metrics.value.navBarHeight}px`)
const spacerStyle = computed(() => `height:${metrics.value.totalHeight}px`)

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/index/index' })
  }
}
</script>

<style lang="scss">
.sv-nav__bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-sizing: border-box;
}

// 背景层单独做透明度过渡，毛玻璃本身无法平滑过渡
.sv-nav__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sv-bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 0.5px solid var(--sv-separator);
  opacity: 0;
  transition: opacity var(--sv-dur-2) var(--sv-ease);
}

.sv-nav__bar.is-solid .sv-nav__bg {
  opacity: 1;
}

.sv-nav__inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.sv-nav__back {
  position: absolute;
  left: 4px;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  color: var(--sv-accent);
  transition: opacity var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    opacity: 0.5;
  }
}

.sv-nav__title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity var(--sv-dur-1) var(--sv-ease),
    transform var(--sv-dur-2) var(--sv-ease);

  &.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
}

.sv-nav__large {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 2px 20px 10px;
  transform-origin: left bottom;
  transition:
    opacity var(--sv-dur-1) var(--sv-ease),
    transform var(--sv-dur-2) var(--sv-ease);

  &.is-collapsed {
    opacity: 0;
    transform: scale(0.94) translateY(-4px);
  }
}
</style>
