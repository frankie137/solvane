<template>
  <sv-sheet :show="show" title="标签" @update:show="emit('update:show', $event)">
    <view class="tags">
      <view v-if="draft.length" class="tags__list">
        <view
          v-for="tag in draft"
          :key="tag"
          class="tags__chip is-on"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="remove(tag)"
        >
          <text>#{{ tag }}</text>
          <sv-icon name="xmark" :size="11" :weight="2.6" color="var(--sv-accent)" />
        </view>
      </view>
      <text v-else class="tags__empty">还没有标签，给它加几个方便以后筛选</text>

      <view class="tags__input">
        <!-- 输入时不回写内容，避免打断中文输入法；添加后换新的输入框来清空，并保持键盘 -->
        <input
          :key="inputVersion"
          class="tags__field"
          :focus="refocus"
          :maxlength="LIMITS.tagMax + 1"
          confirm-type="done"
          :confirm-hold="true"
          placeholder="输入标签，按完成添加"
          placeholder-class="tags__placeholder"
          :adjust-position="false"
          @input="input = $event.detail.value"
          @confirm="addInput"
        />
        <view class="tags__add" :class="{ 'is-disabled': !input.trim() }" @tap="addInput">
          <text>添加</text>
        </view>
      </view>

      <view v-if="suggestions.length" class="tags__block">
        <text class="tags__label">常用标签</text>
        <view class="tags__list">
          <view
            v-for="tag in suggestions"
            :key="tag"
            class="tags__chip"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="add(tag)"
          >
            <text>#{{ tag }}</text>
          </view>
        </view>
      </view>

      <view class="tags__footer">
        <sv-button block :loading="saving" @click="emit('save', draft)">保存</sv-button>
      </view>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LIMITS } from '@shared/constants'
import type { TagCount } from '@shared/types'
import { toast } from '@/utils/dialog'
import { normalizeTag } from '@/utils/tags'

const props = withDefaults(
  defineProps<{
    show: boolean
    tags: string[]
    /** 这一栏已有的标签，按使用次数排序 */
    known?: TagCount[]
    saving?: boolean
  }>(),
  { known: () => [], saving: false },
)

const emit = defineEmits<{ 'update:show': [value: boolean]; save: [tags: string[]] }>()

const draft = ref<string[]>([])
const input = ref('')
const inputVersion = ref(0)
const refocus = ref(false)

// 每次打开都从当前标签开始编辑
watch(
  () => props.show,
  (show) => {
    if (!show) return
    draft.value = [...props.tags]
    input.value = ''
    refocus.value = false
    inputVersion.value++
  },
  { immediate: true },
)

const suggestions = computed(() =>
  props.known
    .map((t) => t.name)
    .filter((name) => !draft.value.includes(name))
    .slice(0, 12),
)

function add(raw: string) {
  const result = normalizeTag(raw)
  if ('error' in result) return toast(result.error)
  if (draft.value.includes(result.tag)) return
  if (draft.value.length >= LIMITS.tagsPerItem) {
    return toast(`每个收藏最多 ${LIMITS.tagsPerItem} 个标签`)
  }
  draft.value = [...draft.value, result.tag]
}

function addInput() {
  if (!input.value.trim()) return
  add(input.value)
  input.value = ''
  refocus.value = true
  inputVersion.value++
}

function remove(tag: string) {
  draft.value = draft.value.filter((t) => t !== tag)
}
</script>

<style lang="scss">
.tags {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 4px;
}

.tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tags__chip {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border-radius: 16px;
  font-size: 14px;
  color: var(--sv-text);
  background-color: var(--sv-fill);
  transition: opacity var(--sv-dur-1) var(--sv-ease);

  &.is-on {
    color: var(--sv-accent);
    background-color: var(--sv-accent-soft);
  }

  &.is-pressed {
    opacity: 0.6;
  }
}

.tags__empty {
  font-size: 14px;
  color: var(--sv-text-2);
}

.tags__input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 4px 0 14px;
  border-radius: var(--sv-radius-s);
  background-color: var(--sv-fill);
}

.tags__field {
  flex: 1;
  height: 44px;
  font-size: 16px;
  color: var(--sv-text);
}

.tags__placeholder {
  color: var(--sv-text-3);
}

.tags__add {
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sv-accent);

  &.is-disabled {
    color: var(--sv-text-3);
  }
}

.tags__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tags__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sv-text-2);
}

.tags__footer {
  padding-top: 4px;
}
</style>
