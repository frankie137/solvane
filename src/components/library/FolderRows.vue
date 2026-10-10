<template>
  <sv-card :padding="2" radius="m">
    <view
      v-for="(folder, i) in folders"
      :key="folder.id"
      class="frow"
      :class="{ 'has-divider': i > 0 }"
      :hover-class="editing ? 'none' : 'is-pressed'"
      :hover-stay-time="60"
      @tap="!editing && emit('open', folder.id)"
      @longpress="!editing && emit('more', folder)"
    >
      <view class="frow__icon">
        <sv-icon name="folder" :size="17" color="var(--sv-text-on-accent)" />
      </view>
      <text class="frow__name">{{ folder.name }}</text>
      <template v-if="editing">
        <view
          class="frow__btn"
          :class="{ 'is-disabled': i === 0 }"
          hover-class="is-pressed"
          @tap.stop="i > 0 && emit('reorder', folder.id, -1)"
        >
          <sv-icon name="chevron.up" :size="18" :weight="2.2" color="var(--sv-accent)" />
        </view>
        <view
          class="frow__btn"
          :class="{ 'is-disabled': i === folders.length - 1 }"
          hover-class="is-pressed"
          @tap.stop="i < folders.length - 1 && emit('reorder', folder.id, 1)"
        >
          <sv-icon name="chevron.down" :size="18" :weight="2.2" color="var(--sv-accent)" />
        </view>
        <view class="frow__btn" hover-class="is-pressed" @tap.stop="emit('more', folder)">
          <sv-icon name="ellipsis" :size="18" color="var(--sv-text-2)" />
        </view>
      </template>
      <template v-else>
        <text class="frow__count">{{ countOf(folder.id) }}</text>
        <sv-icon name="chevron.right" :size="16" :weight="2.2" color="var(--sv-text-3)" />
      </template>
    </view>
  </sv-card>
</template>

<script setup lang="ts">
import type { Folder } from '@shared/types'

const props = withDefaults(
  defineProps<{
    folders: Folder[]
    /** 文件夹 id → 里面直接放着的收藏数（包括子文件夹的数量另算） */
    counts: Record<string, number>
    /** 子文件夹数，显示在数量里 */
    childCounts?: Record<string, number>
    editing?: boolean
  }>(),
  { childCounts: () => ({}), editing: false },
)

const emit = defineEmits<{
  open: [id: string]
  more: [folder: Folder]
  reorder: [id: string, step: -1 | 1]
}>()

function countOf(id: string): string {
  const n = (props.counts[id] ?? 0) + (props.childCounts[id] ?? 0)
  return n > 0 ? String(n) : ''
}
</script>

<style lang="scss">
.frow {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 56px;
    right: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.frow__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background-color: var(--sv-tint-blue);
}

.frow__name {
  flex: 1;
  font-size: 16px;
  line-height: 21px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.frow__count {
  font-size: 15px;
  color: var(--sv-text-2);
  font-variant-numeric: tabular-nums;
}

.frow__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0 -6px;
  border-radius: 22px;

  &.is-pressed {
    background-color: var(--sv-fill);
  }

  &.is-disabled {
    opacity: 0.3;
  }
}
</style>
