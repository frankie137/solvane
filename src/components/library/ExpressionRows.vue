<template>
  <sv-card :padding="2" radius="m">
    <view
      v-for="(item, i) in items"
      :key="item.id"
      class="erow"
      :class="{ 'has-divider': i > 0 }"
      hover-class="is-pressed"
      :hover-stay-time="60"
      @tap="emit('open', item.id)"
      @longpress="emit('more', item)"
    >
      <view class="erow__head">
        <text class="erow__text sv-en">{{ item.text }}</text>
        <text v-if="item.sourceCount > 1" class="erow__badge">{{ item.sourceCount }} 处</text>
      </view>
      <text class="erow__meaning" :class="{ 'is-muted': item.fill !== 'ready' }">{{
        meaningOf(item)
      }}</text>
      <view v-if="item.tags.length" class="erow__tags">
        <text v-for="tag in item.tags" :key="tag" class="erow__tag">#{{ tag }}</text>
      </view>
    </view>
  </sv-card>
</template>

<script setup lang="ts">
import type { ExpressionSummary } from '@shared/types'

defineProps<{ items: ExpressionSummary[] }>()
const emit = defineEmits<{ open: [id: string]; more: [item: ExpressionSummary] }>()

function meaningOf(item: ExpressionSummary): string {
  if (item.fill === 'pending') return '释义生成中…'
  if (item.fill === 'failed') return '释义没有生成，点进去重试'
  return item.meaning
}
</script>

<style lang="scss">
.erow {
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

.erow__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.erow__text {
  flex: 1;
  font-size: 17px;
  line-height: 23px;
  font-weight: 600;
}

.erow__badge {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--sv-text-2);
}

.erow__meaning {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  &.is-muted {
    color: var(--sv-text-3);
  }
}

.erow__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
}

.erow__tag {
  font-size: 12px;
  line-height: 16px;
  color: var(--sv-accent);
}
</style>
