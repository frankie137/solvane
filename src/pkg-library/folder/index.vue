<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar :title="folder?.name ?? '文件夹'" back :collapsed="collapsed">
      <template #trailing>
        <view v-if="folder" class="folder__more" hover-class="is-pressed" @tap="more">
          <sv-icon name="ellipsis" :size="20" color="var(--sv-accent)" />
        </view>
      </template>
    </sv-nav-bar>

    <view class="folder">
      <sv-card v-if="missing" :padding="24">
        <sv-state icon="folder" tone="danger" title="文件夹不存在" description="它可能已经被删除了">
          <sv-button type="secondary" size="sm" @click="goBack">返回</sv-button>
        </sv-state>
      </sv-card>

      <template v-else-if="folder">
        <text v-if="path.length > 1" class="folder__path">{{ path }}</text>
        <tab-switch v-model="tab" />
        <library-browser :tab="tab" :folder-id="folder.id" />
      </template>

      <sv-card v-else :padding="18" radius="m"><sv-skeleton :rows="3" /></sv-card>
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <library-sheets />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { LibraryTab } from '@shared/types'
import LibraryBrowser from '@/components/library/LibraryBrowser.vue'
import LibrarySheets from '@/components/library/LibrarySheets.vue'
import TabSwitch from '@/components/library/TabSwitch.vue'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { provideLibraryActions } from '@/composables/useLibraryActions'
import { useLibraryStore } from '@/stores/library'
import { useSystemStore } from '@/stores/system'
import { chooseAction, toast } from '@/utils/dialog'
import { canCreateIn, folderPath } from '@/utils/folders'

const { collapsed, onScroll } = useCollapsingTitle()
const store = useLibraryStore()
const { folders, loaded } = storeToRefs(store)
const { metrics } = storeToRefs(useSystemStore())
// 删掉当前文件夹（自己的菜单，或在上一级页面里）后返回
const { folders: folderActions } = provideLibraryActions({
  onFolderDeleted: (f) => {
    if (f.id === folderId.value) goBack()
  },
})

const folderId = ref('')
const tab = ref<LibraryTab>('expression')

const folder = computed(() => folders.value.find((f) => f.id === folderId.value) ?? null)
const missing = computed(() => loaded.value && !folder.value)
const path = computed(() =>
  folderPath(folders.value, folderId.value)
    .map((f) => f.name)
    .join(' › '),
)
const bottomInset = computed(() => `height:${metrics.value.safeAreaBottom + 24}px`)

onLoad((query) => {
  folderId.value = String(query?.id ?? '')
  if (query?.tab === 'session') tab.value = 'session'
  // 从深链接直接打开时还没有文件夹数据
  if (!store.loaded) void store.refresh()
})

async function more() {
  const f = folder.value
  if (!f) return
  const canNest = canCreateIn(f)
  const items = ['新建子文件夹', '重命名', '移动到…', '删除']
  const index = await chooseAction(items)
  if (index === 0) {
    if (!canNest) return toast('文件夹最多三级，这里不能再建了')
    await folderActions.create(f.id)
  } else if (index === 1) await folderActions.rename(f)
  else if (index === 2) folderActions.startMove(f)
  else if (index === 3) await folderActions.remove(f)
}

function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index?tab=library' })
}
</script>

<style lang="scss">
.page-scroll {
  height: 100vh;
}

.folder {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 16px;
}

.folder__path {
  padding: 0 4px;
  font-size: 13px;
  color: var(--sv-text-2);
}

.folder__more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: var(--sv-accent-soft);

  &.is-pressed {
    opacity: 0.6;
  }
}
</style>
