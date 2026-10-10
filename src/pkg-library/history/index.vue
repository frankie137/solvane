<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    :lower-threshold="200"
    @scroll="onScroll"
    @scrolltolower="loadMore"
  >
    <sv-nav-bar title="全部对话" back :collapsed="collapsed" />

    <view class="history">
      <search-field placeholder="搜索标题、中文或英文" @search="search" />

      <sv-card v-if="error && items.length === 0" :padding="24">
        <sv-state icon="alert" tone="danger" title="加载失败" :description="error">
          <sv-button type="secondary" size="sm" @click="reload">重试</sv-button>
        </sv-state>
      </sv-card>

      <view v-else-if="!loaded" class="history__list">
        <sv-card v-for="i in 3" :key="i" :padding="18" radius="m"
          ><sv-skeleton :rows="2" title
        /></sv-card>
      </view>

      <sv-card v-else-if="items.length === 0" :padding="32">
        <sv-state
          :icon="keyword ? 'search' : 'sparkles'"
          :title="keyword ? '没有找到' : '还没有对话'"
          :description="keyword ? '换个关键词试试' : '在练习页说出第一段话吧'"
        />
      </sv-card>

      <template v-else>
        <session-rows :items="items" show-star @open="openSession" />
        <text class="history__more">{{ footer }}</text>
      </template>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { SessionSummary } from '@shared/types'
import SearchField from '@/components/library/SearchField.vue'
import SessionRows from '@/components/library/SessionRows.vue'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { callCloud, CloudError } from '@/services/cloud'
import { useSystemStore } from '@/stores/system'

const { collapsed, onScroll } = useCollapsingTitle()
const { metrics } = storeToRefs(useSystemStore())

const items = ref<SessionSummary[]>([])
const loaded = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const error = ref('')
const keyword = ref('')

const bottomInset = computed(() => `height:${metrics.value.safeAreaBottom + 24}px`)
const footer = computed(() => {
  if (loadingMore.value) return '加载中…'
  if (hasMore.value) return '上滑加载更多'
  return `共 ${items.value.length} 个对话`
})

let requestId = 0
let shownOnce = false

async function fetchPage(offset: number) {
  const id = ++requestId
  const res = await callCloud('data', 'listHistory', {
    offset,
    ...(keyword.value ? { keyword: keyword.value } : {}),
  })
  return id === requestId ? res : null
}

async function reload() {
  error.value = ''
  try {
    const res = await fetchPage(0)
    if (!res) return
    items.value = res.items
    hasMore.value = res.hasMore
  } catch (err) {
    error.value = err instanceof CloudError ? err.message : '加载失败'
  } finally {
    loaded.value = true
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await fetchPage(items.value.length)
    if (!res) return
    // 翻页期间对话可能更新了顺序，按 id 去重
    const seen = new Set(items.value.map((s) => s.id))
    items.value = [...items.value, ...res.items.filter((s) => !seen.has(s.id))]
    hasMore.value = res.hasMore
  } catch (err) {
    uni.showToast({ title: err instanceof CloudError ? err.message : '加载失败', icon: 'none' })
  } finally {
    loadingMore.value = false
  }
}

function search(next: string) {
  keyword.value = next
  loaded.value = false
  void reload()
}

onLoad(() => {
  void reload()
})

// 从对话页回来时刷新（可能新收藏了或者改了内容）
onShow(() => {
  if (shownOnce) void reload()
  shownOnce = true
})

function openSession(id: string) {
  uni.navigateTo({ url: `/pkg-session/session/index?id=${encodeURIComponent(id)}` })
}
</script>

<style lang="scss">
.page-scroll {
  height: 100vh;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 16px;
}

.history__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history__more {
  text-align: center;
  font-size: 13px;
  color: var(--sv-text-3);
}
</style>
