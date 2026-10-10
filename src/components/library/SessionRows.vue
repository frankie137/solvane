<template>
  <sv-card :padding="2" radius="m">
    <view
      v-for="(item, i) in items"
      :key="item.id"
      class="srow"
      :class="{ 'has-divider': i > 0 }"
      hover-class="is-pressed"
      :hover-stay-time="60"
      @tap="emit('open', item.id)"
      @longpress="emit('more', item)"
    >
      <view class="srow__head">
        <text class="srow__title">{{ item.title }}</text>
        <sv-icon
          v-if="showStar && item.starredAt"
          name="bookmark.fill"
          :size="13"
          color="var(--sv-accent)"
        />
        <text class="srow__time">{{ formatRelative(item.updatedAt) }}</text>
      </view>
      <text class="srow__preview" :class="{ 'sv-en': item.state === 'ready' }">{{
        item.preview
      }}</text>
      <view v-if="item.tags.length" class="srow__tags">
        <text v-for="tag in item.tags" :key="tag" class="srow__tag">#{{ tag }}</text>
      </view>
    </view>
  </sv-card>
</template>

<script setup lang="ts">
import type { SessionSummary } from '@shared/types'
import { formatRelative } from '@/utils/time'

withDefaults(defineProps<{ items: SessionSummary[]; showStar?: boolean }>(), { showStar: false })
const emit = defineEmits<{ open: [id: string]; more: [item: SessionSummary] }>()
</script>

<style lang="scss">
.srow {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 16px;
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

.srow__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.srow__title {
  flex: 1;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.srow__time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--sv-text-3);
}

.srow__preview {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.srow__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
}

.srow__tag {
  font-size: 12px;
  line-height: 16px;
  color: var(--sv-accent);
}
</style>
