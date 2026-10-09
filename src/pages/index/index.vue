<template>
  <view class="shell">
    <view
      v-for="tab in TABS"
      :key="tab.key"
      class="shell__pane"
      :class="{ 'is-active': active === tab.key }"
    >
      <!-- 首次切到某个 tab 才挂载，之后保留状态 -->
      <template v-if="visited[tab.key]">
        <practice-tab v-if="tab.key === 'practice'" />
        <library-tab v-else-if="tab.key === 'library'" />
        <me-tab v-else-if="tab.key === 'me'" />
      </template>
    </view>
    <sv-tab-bar v-model="active" :items="TABS" />
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { TabItem } from '@/components/sv-tab-bar/sv-tab-bar.vue'
import PracticeTab from './tabs/PracticeTab.vue'
import LibraryTab from './tabs/LibraryTab.vue'
import MeTab from './tabs/MeTab.vue'

type TabKey = 'practice' | 'library' | 'me'

const TABS: (TabItem & { key: TabKey })[] = [
  { key: 'practice', text: '练习', icon: 'waveform' },
  { key: 'library', text: '收藏', icon: 'bookmark', activeIcon: 'bookmark.fill' },
  { key: 'me', text: '我的', icon: 'person', activeIcon: 'person.fill' },
]

const active = ref<TabKey>('practice')
const visited = reactive<Record<TabKey, boolean>>({ practice: true, library: false, me: false })

watch(active, (key) => {
  visited[key] = true
})

// 支持 /pages/index/index?tab=me 直接打开某个 tab（冒烟测试和以后的深链接用）
onLoad((query) => {
  const tab = TABS.find((t) => t.key === query?.tab)
  if (tab) active.value = tab.key
})
</script>

<style lang="scss">
.shell {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background-color: var(--sv-bg);
}

.shell__pane {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: scale(0.985);
  // 后台 tab 里的循环动画暂停（CSS 变量能穿透组件边界继承下去）
  --sv-play: paused;
  transition:
    opacity var(--sv-dur-2) var(--sv-ease),
    transform var(--sv-dur-3) var(--sv-ease),
    visibility 0s linear var(--sv-dur-2);

  &.is-active {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: none;
    transition-delay: 0s;
    --sv-play: running;
  }
}
</style>
