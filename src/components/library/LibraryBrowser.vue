<template>
  <view class="browser">
    <view v-if="shownError && !hasContent && ready" class="browser__state">
      <sv-card :padding="24">
        <sv-state icon="alert" tone="danger" title="收藏加载失败" :description="shownError">
          <sv-button type="secondary" size="sm" @click="retry">重试</sv-button>
        </sv-state>
      </sv-card>
    </view>

    <view v-else-if="!ready" class="browser__state">
      <sv-card :padding="18" radius="m"><sv-skeleton :rows="3" /></sv-card>
    </view>

    <view v-else class="browser__content">
      <!-- Refresh failed while content is already shown: keep the content and show a notice above -->
      <view v-if="shownError" class="browser__stale" hover-class="is-pressed" @tap="retry">
        <sv-icon name="alert" :size="14" color="var(--sv-danger)" />
        <text class="browser__stale-text">没能刷新 · 点这里重试</text>
      </view>
      <view v-if="folders.length" class="browser__block">
        <view class="browser__head">
          <text class="browser__label">文件夹</text>
          <view
            v-if="folders.length > 1"
            class="browser__link"
            hover-class="is-pressed"
            @tap="editing = !editing"
          >
            <text>{{ editing ? '完成' : '排序' }}</text>
          </view>
        </view>
        <folder-rows
          :folders="folders"
          :counts="counts"
          :editing="editing"
          @open="openFolder"
          @more="folderActions.more"
          @reorder="onReorder"
        />
      </view>

      <view v-if="tab === 'expression' && expressions.length" class="browser__block">
        <text v-if="itemsLabel" class="browser__label">{{ itemsLabel }}</text>
        <expression-rows :items="expressions" @open="openExpression" @more="moreExpression" />
      </view>

      <view v-if="tab === 'session' && sessions.length" class="browser__block">
        <text v-if="itemsLabel" class="browser__label">{{ itemsLabel }}</text>
        <session-rows :items="sessions" @open="openSession" @more="moreSession" />
      </view>

      <view v-if="!hasContent" class="browser__state">
        <sv-card :padding="32">
          <sv-state :icon="empty.icon" :title="empty.title" :description="empty.description" />
        </sv-card>
      </view>

      <text v-if="hasContent && !keyword && !tag" class="browser__hint"
        >长按收藏可以移动、打标签</text
      >
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { ExpressionSummary, LibraryTab, SessionSummary } from '@shared/types'
import type { IconName } from '@/components/sv-icon/icons'
import { useLibraryActions } from '@/composables/useLibraryActions'
import { CloudError } from '@/services/cloud'
import { listFavorites } from '@/services/library'
import { useLibraryStore } from '@/stores/library'
import { childrenOf } from '@/utils/folders'
import { navigateTo } from '@/utils/nav'
import ExpressionRows from './ExpressionRows.vue'
import FolderRows from './FolderRows.vue'
import SessionRows from './SessionRows.vue'

const props = withDefaults(
  defineProps<{
    tab: LibraryTab
    /** Current folder; null means the root */
    folderId: string | null
    tag?: string
    keyword?: string
  }>(),
  { tag: '', keyword: '' },
)

const store = useLibraryStore()
const {
  folders: allFolders,
  counts: allCounts,
  revision,
  loaded: foldersLoaded,
  error: foldersError,
} = storeToRefs(store)
const { organizer, folders: folderActions } = useLibraryActions()

const expressions = ref<ExpressionSummary[]>([])
const sessions = ref<SessionSummary[]>([])
const loaded = ref(false)
const error = ref('')
const editing = ref(false)

/** Hide folders while searching or filtering by tag */
const flat = computed(() => Boolean(props.keyword || props.tag))
const folders = computed(() => (flat.value ? [] : childrenOf(allFolders.value, props.folderId)))
const counts = computed(() => allCounts.value[props.tab])

const items = computed(() => (props.tab === 'expression' ? expressions.value : sessions.value))
const hasContent = computed(() => folders.value.length > 0 || items.value.length > 0)
const itemsLabel = computed(() => {
  if (flat.value) return ''
  if (props.folderId === null) return folders.value.length ? '未归类' : ''
  return folders.value.length ? (props.tab === 'expression' ? '表达' : '对话') : ''
})

const empty = computed<{ icon: IconName; title: string; description: string }>(() => {
  if (props.keyword) return { icon: 'search', title: '没有找到', description: '换个关键词试试' }
  if (props.tag) return { icon: 'tag', title: `没有带 #${props.tag} 的收藏`, description: '' }
  if (props.folderId)
    return {
      icon: 'folder',
      title: '文件夹是空的',
      description: '在收藏上长按，选「移动到…」放进来',
    }
  return props.tab === 'expression'
    ? {
        icon: 'bookmark',
        title: '还没有收藏表达',
        description: '在对话页的解析里点收藏，或长按一句英文挑词收藏；评分报告里的单词也能收藏。',
      }
    : {
        icon: 'bookmark',
        title: '还没有收藏对话',
        description: '在对话页点左上角的收藏图标，就会出现在这里。',
      }
})

let requestId = 0

/** Loaded only once folder data has arrived too, so the folder section doesn't pop in later and make the page jump */
const ready = computed(() => loaded.value && foldersLoaded.value)
/** Show an error if either this list or the folder data failed */
const shownError = computed(() => error.value || foldersError.value)

/** Retry: show loading first instead of flashing the empty state */
function retry() {
  loaded.value = false
  if (foldersError.value) void store.refresh()
  void load()
}

async function load() {
  const id = ++requestId
  error.value = ''
  try {
    const res = await listFavorites(props.tab, {
      folderId: props.folderId,
      ...(props.tag ? { tag: props.tag } : {}),
      ...(props.keyword ? { keyword: props.keyword } : {}),
    })
    // Only use the latest request's result so a stale one can't overwrite a newer one when switching quickly
    if (id !== requestId) return
    expressions.value = res.expressions
    sessions.value = res.sessions
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
  } finally {
    if (id === requestId) loaded.value = true
  }
}

// When the content to show changes, show loading rather than the previous result or empty state; when saved items change, refresh in place
watch(
  () => [props.tab, props.folderId, props.tag, props.keyword],
  () => {
    loaded.value = false
    void load()
  },
  { immediate: true },
)
watch(revision, () => void load())

watch(
  () => props.tab,
  () => {
    editing.value = false
  },
)

function onReorder(id: string, step: -1 | 1) {
  void folderActions.reorder(props.folderId, id, step)
}

function openFolder(id: string) {
  navigateTo(`/pkg-library/folder/index?id=${encodeURIComponent(id)}&tab=${props.tab}`)
}

function openExpression(id: string) {
  navigateTo(`/pkg-library/expression/index?id=${encodeURIComponent(id)}`)
}

function openSession(id: string) {
  navigateTo(`/pkg-session/session/index?id=${encodeURIComponent(id)}`)
}

function moreExpression(item: ExpressionSummary) {
  void organizer.itemMore(
    { tab: 'expression', id: item.id, folderId: item.folderId, tags: item.tags },
    item.text,
  )
}

function moreSession(item: SessionSummary) {
  void organizer.itemMore({ tab: 'session', id: item.id, folderId: item.folderId, tags: item.tags })
}

defineExpose({ load })
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.browser {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.browser__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.browser__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.browser__label {
  padding: 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--sv-text-2);
}

.browser__link {
  padding: 2px 6px;
  font-size: 14px;
  color: var(--sv-accent);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.5;
  }
}

.browser__stale {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--sv-radius-s);
  background-color: var(--sv-surface);

  &.is-pressed {
    opacity: 0.6;
  }
}

.browser__stale-text {
  font-size: 14px;
  color: var(--sv-text-2);
}

.browser__hint {
  text-align: center;
  font-size: 13px;
  color: var(--sv-text-3);
}

.browser__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  @include sv-appear;
}
</style>
