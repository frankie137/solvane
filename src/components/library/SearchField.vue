<template>
  <view class="search">
    <sv-icon name="search" :size="16" :weight="2" color="var(--sv-text-3)" />
    <!-- Don't write the value back while typing, which would interrupt Chinese IME input; clearing swaps in a fresh input -->
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
    <view v-if="typed" class="search__clear" hover-class="is-pressed" @tap="clear">
      <sv-icon name="xmark" :size="10" :weight="3" color="var(--sv-surface)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

defineProps<{ placeholder: string }>()
/** Emit the keyword 300ms after typing stops, on the search key, or on clear (trimmed; not emitted if unchanged) */
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
@import '@/styles/mixins.scss';

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
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.6;
  }
}
</style>
