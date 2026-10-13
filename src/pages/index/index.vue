<template>
  <view class="shell">
    <view
      v-for="tab in TABS"
      :key="tab.key"
      class="shell__pane"
      :class="{ 'is-active': active === tab.key }"
    >
      <!-- Mount a tab the first time it's opened, then keep its state -->
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
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useAccountStore } from '@/stores/account'
import { useLibraryStore } from '@/stores/library'
import { useProfileStore } from '@/stores/profile'
import { useSessionsStore } from '@/stores/sessions'
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

// Refresh recent sessions and saved items every time the home page shows (so the latest state is
// visible after returning from a session or a saved item)
const sessionsStore = useSessionsStore()
const libraryStore = useLibraryStore()
const profileStore = useProfileStore()
const accountStore = useAccountStore()
onShow(() => {
  void sessionsStore.refresh()
  // Membership status: a free use may have just been spent, or an admin may have just granted Pro;
  // creates the record on first open
  accountStore.refresh()
  if (visited.library) libraryStore.touch()
  // The "Me" tab (「我的」) is never unmounted; renew the temporary avatar URL before it expires
  if (visited.me) void profileStore.refreshIfStale()
})

// Open a tab directly via /pages/index/index?tab=me (for the smoke test and future deep links)
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
  // Pause looping animations in background tabs (CSS variables inherit across components)
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
