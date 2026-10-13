<template>
  <scroll-view
    class="tab-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="收藏" :collapsed="collapsed">
      <template #trailing>
        <view class="library__new" hover-class="is-pressed" @tap="folderActions.create(null)">
          <sv-icon name="plus" :size="20" :weight="2.2" color="var(--sv-accent)" />
        </view>
      </template>
    </sv-nav-bar>

    <view class="library">
      <tab-switch v-model="tab" />

      <search-field
        :placeholder="tab === 'expression' ? '搜索表达、释义、备注' : '搜索收藏的对话'"
        @search="keyword = $event"
      />

      <scroll-view
        v-if="tags.length && !keyword"
        class="tagbar"
        scroll-x
        :enhanced="true"
        :show-scrollbar="false"
      >
        <view class="tagbar__inner">
          <sv-chip
            v-for="t in tags"
            :key="t.name"
            :active="tag === t.name"
            @click="toggleTag(t.name)"
          >
            #{{ t.name }}
          </sv-chip>
        </view>
      </scroll-view>

      <library-browser :tab="tab" :folder-id="null" :tag="tag" :keyword="keyword" />
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <library-sheets />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { LibraryTab, TagCount } from '@shared/types'
import LibraryBrowser from '@/components/library/LibraryBrowser.vue'
import LibrarySheets from '@/components/library/LibrarySheets.vue'
import SearchField from '@/components/library/SearchField.vue'
import TabSwitch from '@/components/library/TabSwitch.vue'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { provideLibraryActions } from '@/composables/useLibraryActions'
import { useTabBarInset } from '@/composables/useTabBarInset'
import { listTags } from '@/services/library'
import { useLibraryStore } from '@/stores/library'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()
const store = useLibraryStore()
const { revision } = storeToRefs(store)
const { folders: folderActions } = provideLibraryActions()

const tab = ref<LibraryTab>('expression')
const tag = ref('')
const tags = ref<TagCount[]>([])

const keyword = ref('')

// --- Tags -------------------------------------------------------------------

async function loadTags() {
  try {
    tags.value = await listTags(tab.value)
    // Clear the filter if the selected tag no longer exists (deleted or renamed)
    if (tag.value && !tags.value.some((t) => t.name === tag.value)) tag.value = ''
  } catch {
    // The tag bar is only a way to filter; hide it if loading fails
  }
}

function toggleTag(name: string) {
  tag.value = tag.value === name ? '' : name
}

watch(tab, () => {
  tag.value = ''
})
watch([tab, revision], () => void loadTags(), { immediate: true })

void store.refresh()
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.library {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 16px;
}

.library__new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: var(--sv-accent-soft);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.6;
  }
}

.tagbar {
  white-space: nowrap;
  margin: 0 -16px;
}

.tagbar__inner {
  display: inline-flex;
  gap: 8px;
  padding: 0 16px;
}
</style>
