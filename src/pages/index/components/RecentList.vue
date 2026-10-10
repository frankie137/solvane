<template>
  <view class="recent">
    <view v-if="!loaded" class="recent__list">
      <sv-card v-for="i in 2" :key="i" :padding="18" radius="m">
        <sv-skeleton :rows="2" title />
      </sv-card>
    </view>

    <sv-card v-else-if="error && items.length === 0" :padding="24">
      <sv-state icon="alert" tone="danger" title="最近对话加载失败" :description="error">
        <sv-button type="secondary" size="sm" @click="emit('retry')">重试</sv-button>
      </sv-state>
    </sv-card>

    <sv-card v-else-if="items.length === 0" :padding="24">
      <sv-state
        icon="sparkles"
        title="还没有对话"
        description="说出第一段话，这里会记录你的每一次练习。"
      />
    </sv-card>

    <view v-else class="recent__list">
      <view
        v-for="item in items"
        :key="item.id"
        class="recent__item"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="emit('open', item.id)"
      >
        <view class="recent__head">
          <text class="recent__title">{{ item.title }}</text>
          <text v-if="item.state !== 'ready'" class="recent__badge" :class="`is-${item.state}`">
            {{ STATE_TEXT[item.state] }}
          </text>
        </view>
        <text class="recent__preview" :class="{ 'sv-en': item.state === 'ready' }">
          {{ item.preview }}
        </text>
        <text class="recent__meta">{{ metaText(item) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { SessionSummary } from '@shared/types'
import { formatRelative } from '@/utils/time'

defineProps<{ items: SessionSummary[]; loaded: boolean; error: string }>()
const emit = defineEmits<{ open: [id: string]; retry: [] }>()

function metaText(item: SessionSummary): string {
  const time = formatRelative(item.updatedAt)
  return item.versionCount > 1 ? `${time} · ${item.versionCount} 个版本` : time
}

const STATE_TEXT: Record<SessionSummary['state'], string> = {
  ready: '',
  running: '生成中',
  pending: '待生成',
  failed: '生成失败',
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.recent__list {
  @include sv-appear;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recent__item {
  padding: 16px 18px;
  border-radius: var(--sv-radius-m);
  background-color: var(--sv-surface);
  box-shadow: var(--sv-shadow-card);
  transition: transform var(--sv-dur-1) var(--sv-ease-spring);

  &.is-pressed {
    transform: scale(0.98);
  }
}

.recent__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recent__title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
}

.recent__badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 16px;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);

  &.is-failed {
    color: var(--sv-danger);
    background-color: var(--sv-fill);
  }
}

.recent__preview {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 15px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.recent__meta {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 16px;
  color: var(--sv-text-3);
}
</style>
