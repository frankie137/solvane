<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="我的分享" back :collapsed="collapsed" />

    <view class="mine">
      <sv-card v-if="error && items.length === 0" :padding="24">
        <sv-state icon="alert" tone="danger" title="分享列表加载失败" :description="error">
          <sv-button type="secondary" size="sm" @click="retry">重试</sv-button>
        </sv-state>
      </sv-card>

      <sv-card v-else-if="!loaded" :padding="18" radius="m"><sv-skeleton :rows="3" /></sv-card>

      <sv-card v-else-if="items.length === 0" :padding="32">
        <sv-state
          icon="share"
          title="还没有分享过"
          description="在评分报告里点「分享这次背诵」，把录音做成歌词页发给朋友。"
        />
      </sv-card>

      <view v-else class="mine__content">
        <sv-card :padding="2" radius="m">
          <view
            v-for="(item, i) in items"
            :key="item.id"
            class="share-row"
            :class="{ 'has-divider': i > 0 }"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="open(item.id)"
            @longpress="more(item)"
          >
            <view class="share-row__main">
              <text class="share-row__title">{{ item.title }}</text>
              <text class="share-row__preview sv-en">{{ item.preview }}</text>
              <text class="share-row__meta">{{ meta(item) }}</text>
            </view>
            <view class="share-row__more" hover-class="is-pressed" @tap.stop="more(item)">
              <sv-icon name="ellipsis" :size="18" color="var(--sv-text-2)" />
            </view>
          </view>
        </sv-card>
        <text class="mine__hint">撤回后好友再打开会显示「分享已撤回」</text>
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import type { ShareSummary } from '@shared/types'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { CloudError } from '@/services/cloud'
import { listShares, revokeShare, sharePath } from '@/services/share'
import { chooseAction, confirmAction, toast } from '@/utils/dialog'
import { formatClock } from '@/utils/lyrics'
import { useSystemStore } from '@/stores/system'
import { navigateTo } from '@/utils/nav'
import { formatRelative } from '@/utils/time'

const { metrics: systemMetrics } = storeToRefs(useSystemStore())
// 底部留出安全区，最后的内容不贴着手势条
const bottomInset = computed(() => `height:${systemMetrics.value.safeAreaBottom + 24}px`)

const { collapsed, onScroll } = useCollapsingTitle()
const items = ref<ShareSummary[]>([])
const loaded = ref(false)
const error = ref('')

async function load() {
  error.value = ''
  try {
    items.value = await listShares()
  } catch (err) {
    error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
  } finally {
    loaded.value = true
  }
}

/** 重试：先显示加载中，不闪空状态 */
function retry() {
  loaded.value = false
  void load()
}

// 从歌词页回来时也刷新
onShow(() => void load())

function meta(item: ShareSummary): string {
  return `${formatRelative(item.createdAt)} · ${formatClock(item.durationMs)}`
}

function open(id: string) {
  navigateTo(sharePath(id))
}

async function more(item: ShareSummary) {
  const index = await chooseAction(['打开', '撤回分享'])
  if (index === 0) return open(item.id)
  if (index !== 1) return
  const ok = await confirmAction({
    title: '撤回这个分享？',
    content: '好友再打开会显示「分享已撤回」，录音副本也会删除。',
    confirmText: '撤回',
    danger: true,
  })
  if (!ok) return
  try {
    await revokeShare(item.id)
    items.value = items.value.filter((x) => x.id !== item.id)
    toast('已撤回')
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '撤回失败，请重试')
  }
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.mine {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}

.mine__hint {
  text-align: center;
  font-size: 13px;
  color: var(--sv-text-3);
}

.share-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 12px 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.share-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.share-row__title {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}

.share-row__preview {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.share-row__meta {
  font-size: 12px;
  color: var(--sv-text-3);
}

.share-row__more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 22px;

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.mine__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  @include sv-appear;
}
</style>
