<template>
  <sv-sheet :show="show" :title="title" @update:show="emit('update:show', $event)">
    <scroll-view class="picker" scroll-y :enhanced="true" :show-scrollbar="false">
      <view
        class="picker__row"
        :class="{ 'is-current': current === null, 'is-disabled': !rootAllowed }"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="pick(null)"
      >
        <view class="picker__icon is-root">
          <sv-icon
            :name="movingFolderId ? 'folder' : 'bookmark'"
            :size="16"
            color="var(--sv-text-on-accent)"
          />
        </view>
        <text class="picker__name">{{ movingFolderId ? '收藏（根目录）' : '未归类' }}</text>
        <sv-icon v-if="current === null" name="checkmark" :size="18" color="var(--sv-accent)" />
      </view>

      <view
        v-for="row in rows"
        :key="row.folder.id"
        class="picker__row"
        :class="{ 'is-current': current === row.folder.id, 'is-disabled': row.disabled }"
        :style="`padding-left:${16 + (row.folder.depth - 1) * 22}px`"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="pick(row.folder.id)"
      >
        <view class="picker__icon">
          <sv-icon name="folder" :size="16" color="var(--sv-text-on-accent)" />
        </view>
        <text class="picker__name">{{ row.folder.name }}</text>
        <sv-icon
          v-if="current === row.folder.id"
          name="checkmark"
          :size="18"
          color="var(--sv-accent)"
        />
        <view
          v-else-if="row.canCreate"
          class="picker__add"
          hover-class="is-pressed"
          :hover-stop-propagation="true"
          @tap.stop="create(row.folder)"
        >
          <sv-icon name="plus" :size="16" :weight="2.2" color="var(--sv-text-2)" />
        </view>
      </view>
    </scroll-view>

    <view class="picker__footer">
      <sv-button type="secondary" block :loading="creating" @click="create(null)">
        <sv-icon name="plus" :size="16" :weight="2.2" />
        <text>新建文件夹</text>
      </sv-button>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Folder } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { useLibraryStore } from '@/stores/library'
import { promptText, toast } from '@/utils/dialog'
import { canCreateIn, canMoveInto, flattenTree } from '@/utils/folders'

const props = withDefaults(
  defineProps<{
    show: boolean
    /** Current folder; null means uncategorized / root */
    current: string | null
    title?: string
    /** Passed when moving a folder: it can't move into its own subtree or go deeper than three levels */
    movingFolderId?: string
  }>(),
  { title: '移动到', movingFolderId: '' },
)

const emit = defineEmits<{ 'update:show': [value: boolean]; pick: [folderId: string | null] }>()

const store = useLibraryStore()
const { folders } = storeToRefs(store)
const creating = ref(false)

const rows = computed(() =>
  flattenTree(folders.value).map((folder) => ({
    folder,
    canCreate: canCreateIn(folder),
    disabled: props.movingFolderId
      ? !canMoveInto(folders.value, props.movingFolderId, folder)
      : false,
  })),
)

const rootAllowed = computed(
  () => !props.movingFolderId || canMoveInto(folders.value, props.movingFolderId, null),
)

function pick(folderId: string | null) {
  if (
    folderId === null
      ? !rootAllowed.value
      : rows.value.find((r) => r.folder.id === folderId)?.disabled
  ) {
    toast('不能移到这里：不能放进它自己里面，也不能超过三级')
    return
  }
  emit('pick', folderId)
  emit('update:show', false)
}

/** Create a folder under a folder (parent) or at the root; select it once created */
async function create(parent: Folder | null) {
  if (creating.value) return
  const name = await promptText({
    title: parent ? `在「${parent.name}」里新建` : '新建文件夹',
    placeholder: '文件夹名',
  })
  if (!name) return
  creating.value = true
  try {
    const folder = await store.createFolder(name, parent?.id ?? null)
    if (!props.movingFolderId) pick(folder.id)
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '新建失败，请重试')
  } finally {
    creating.value = false
  }
}
</script>

<style lang="scss">
.picker {
  max-height: 52vh;
  margin: 0 -20px;
}

.picker__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 20px 0 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    background-color: var(--sv-fill);
  }

  &.is-current .picker__name {
    color: var(--sv-accent);
    font-weight: 600;
  }

  &.is-disabled {
    opacity: 0.35;
  }
}

.picker__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background-color: var(--sv-tint-blue);

  &.is-root {
    background-color: var(--sv-tint-gray);
  }
}

.picker__name {
  flex: 1;
  font-size: 16px;
  line-height: 21px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.picker__add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -10px;
  border-radius: 22px;

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.picker__footer {
  padding: 12px 0 4px;
}
</style>
