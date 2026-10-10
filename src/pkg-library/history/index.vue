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
        <sv-state icon="alert" tone="danger" title="对话列表加载失败" :description="error">
          <sv-button type="secondary" size="sm" @click="retry">重试</sv-button>
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

      <view v-else class="history__content">
        <session-rows :items="items" show-star @open="openSession" />
        <view
          v-if="moreFailed"
          class="history__more is-error"
          hover-class="is-pressed"
          @tap="loadMore"
        >
          <text>加载失败，点这里重试</text>
        </view>
        <text v-else class="history__more">{{ footer }}</text>
      </view>
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
import { navigateTo } from '@/utils/nav'

const { collapsed, onScroll } = useCollapsingTitle()
const { metrics } = storeToRefs(useSystemStore())

const items = ref<SessionSummary[]>([])
const loaded = ref(false)
const loadingMore = ref(false)
/** 翻页失败：已经在底部时不会再触发上滑加载，给一个点击重试的入口 */
const moreFailed = ref(false)
const hasMore = ref(false)
const error = ref('')
const keyword = ref('')

const bottomInset = computed(() => `height:${metrics.value.safeAreaBottom + 24}px`)
const footer = computed(() => {
  if (loadingMore.value) return '加载中…'
  if (hasMore.value) return '上滑加载更多'
  return `共 ${items.value.length} 个对话`
})

/** 换关键词时加一：旧关键词的第一页和翻页结果都作废 */
let generation = 0
let reloading = false
let shownOnce = false

function fetchPage(offset: number) {
  return callCloud('data', 'listHistory', {
    offset,
    ...(keyword.value ? { keyword: keyword.value } : {}),
  })
}

/** 重新取第一页；keep 为 true 时保留已经翻过的后面几页（从对话页返回时用，不丢位置） */
async function reload(keep = false) {
  const gen = keep ? generation : ++generation
  error.value = ''
  if (!keep) hasMore.value = false
  reloading = true
  try {
    const res = await fetchPage(0)
    if (gen !== generation) return
    const first = new Set(res.items.map((s) => s.id))
    const rest = keep ? items.value.slice(res.items.length).filter((s) => !first.has(s.id)) : []
    items.value = [...res.items, ...rest]
    if (!keep || rest.length === 0) hasMore.value = res.hasMore
  } catch (err) {
    if (gen === generation)
      error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
  } finally {
    if (gen === generation) {
      reloading = false
      loaded.value = true
    }
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || reloading) return
  const gen = generation
  loadingMore.value = true
  moreFailed.value = false
  try {
    const res = await fetchPage(items.value.length)
    if (gen !== generation) return
    // 翻页期间对话可能更新了顺序，按 id 去重
    const seen = new Set(items.value.map((s) => s.id))
    items.value = [...items.value, ...res.items.filter((s) => !seen.has(s.id))]
    hasMore.value = res.hasMore
  } catch (err) {
    if (gen === generation) {
      moreFailed.value = true
      uni.showToast({
        title: err instanceof CloudError ? err.message : '加载失败，请重试',
        icon: 'none',
      })
    }
  } finally {
    loadingMore.value = false
  }
}

/** 重试：先显示加载中，不闪空状态 */
function retry() {
  loaded.value = false
  void reload()
}

function search(next: string) {
  keyword.value = next
  loaded.value = false
  void reload()
}

onLoad(() => {
  void reload()
})

// 从对话页回来时刷新第一页（可能新收藏了或者改了内容），已经翻过的保留
onShow(() => {
  if (shownOnce) void reload(true)
  shownOnce = true
})

function openSession(id: string) {
  navigateTo(`/pkg-session/session/index?id=${encodeURIComponent(id)}`)
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

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
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  text-align: center;
  font-size: 13px;
  color: var(--sv-text-3);

  &.is-error {
    color: var(--sv-accent);
  }

  &.is-pressed {
    opacity: 0.5;
  }
}

.history__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  @include sv-appear;
}
</style>
