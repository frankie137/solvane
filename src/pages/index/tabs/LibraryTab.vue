<template>
  <scroll-view
    class="tab-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="收藏" :collapsed="collapsed" />

    <view class="library">
      <sv-card class="library__empty" :padding="32">
        <view class="library__icon">
          <sv-icon name="folder" :size="30" />
        </view>
        <text class="sv-headline">收藏夹还空着</text>
        <text class="sv-subhead sv-secondary">
          在对话页点一下收藏，就会出现在这里。支持最多三级文件夹和标签。
        </text>
      </sv-card>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useTabBarInset } from '@/composables/useTabBarInset'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()
</script>

<style lang="scss">
.library {
  padding: 0 16px;
}

.library__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.library__icon {
  width: 60px;
  height: 60px;
  margin-bottom: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);
}
</style>
