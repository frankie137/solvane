<template>
  <view class="search">
    <sv-icon name="search" :size="16" :weight="2" color="var(--sv-text-3)" />
    <!-- 输入时不回写内容，避免打断中文输入法；清空时换新的输入框 -->
    <input
      :key="version"
      class="search__input"
      :placeholder="placeholder"
      placeholder-class="search__placeholder"
      confirm-type="search"
      :adjust-position="false"
      @input="onInput"
      @confirm="apply"
    />
    <view v-if="typed" class="search__clear" @tap="clear">
      <sv-icon name="xmark" :size="10" :weight="3" color="var(--sv-surface)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

defineProps<{ placeholder: string }>()
/** 停止输入 300ms 后、按搜索键或清空时发出关键词（已去掉首尾空白，没变化时不发） */
const emit = defineEmits<{ search: [keyword: string] }>()

const DEBOUNCE_MS = 300
const typed = ref('')
const version = ref(0)
let applied = ''
let timer: ReturnType<typeof setTimeout> | null = null

function onInput(e: { detail: { value: string } }) {
  typed.value = e.detail.value
  if (timer) clearTimeout(timer)
  timer = setTimeout(apply, DEBOUNCE_MS)
}

function apply() {
  if (timer) clearTimeout(timer)
  const next = typed.value.trim()
  if (next === applied) return
  applied = next
  emit('search', next)
}

function clear() {
  typed.value = ''
  version.value++
  apply()
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style lang="scss">
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px 0 12px;
  border-radius: 10px;
  background-color: var(--sv-fill);
}

.search__input {
  flex: 1;
  height: 38px;
  font-size: 16px;
  color: var(--sv-text);
}

.search__placeholder {
  color: var(--sv-text-3);
}

.search__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  background-color: var(--sv-text-3);
}
</style>
