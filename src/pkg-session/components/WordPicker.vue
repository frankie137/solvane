<template>
  <sv-sheet :show="show" title="挑词收藏" @update:show="emit('update:show', $event)">
    <view class="pick">
      <text class="pick__hint">点一个词收藏单词；先后点首尾两个词，收藏中间的短语</text>
      <view class="pick__tokens sv-en">
        <view
          v-for="(t, i) in tokens"
          :key="i"
          class="pick__token"
          hover-class="is-pressed"
          :hover-stay-time="60"
          :class="{ 'is-on': inRange(i), 'is-edge': i === start || i === end }"
          @tap="tapToken(i)"
        >
          <text>{{ t.text }}</text>
        </view>
      </view>

      <view class="pick__preview">
        <text v-if="selected" class="pick__selected sv-en">{{ selected }}</text>
        <text v-else class="pick__placeholder">还没有选</text>
        <text v-if="selected && alreadySaved" class="pick__saved"
          >已经收藏过，这句会作为新的来源</text
        >
      </view>

      <sv-button block haptic :disabled="!selected" :loading="saving" @click="save">
        <sv-icon name="bookmark" :size="16" color="var(--sv-text-on-accent)" />
        <text>收藏</text>
      </sv-button>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LIMITS } from '@shared/constants'
import { expressionKey, tokenizeWords } from '@shared/expression'
import { toast } from '@/utils/dialog'

const props = withDefaults(
  defineProps<{
    show: boolean
    sentence: string
    /** Merge key of saved expressions → id */
    savedKeys: Record<string, string>
    saving?: boolean
  }>(),
  { saving: false },
)

const emit = defineEmits<{ 'update:show': [value: boolean]; save: [text: string] }>()

const start = ref(-1)
const end = ref(-1)

/** Split into words, keeping the original spelling (apostrophes, capitalization) */
const tokens = computed(() =>
  tokenizeWords(props.sentence).map((t) => ({ ...t, text: props.sentence.slice(t.start, t.end) })),
)

watch(
  () => [props.show, props.sentence],
  () => {
    start.value = -1
    end.value = -1
  },
)

const inRange = (i: number) =>
  start.value >= 0 && i >= start.value && i <= Math.max(start.value, end.value)

const selected = computed(() => {
  const first = tokens.value[start.value]
  const last = tokens.value[Math.max(start.value, end.value)]
  if (!first || !last) return ''
  return props.sentence.slice(first.start, last.end)
})

const alreadySaved = computed(() => Boolean(props.savedKeys[expressionKey(selected.value)]))

/**
 * The first tap selects a word; tapping another word sets the range; tapping the selected first
 * word cancels
 */
function tapToken(i: number) {
  if (start.value < 0 || end.value >= 0) {
    start.value = i
    end.value = -1
    return
  }
  if (i === start.value) {
    start.value = -1
    return
  }
  const [a, b] = i < start.value ? [i, start.value] : [start.value, i]
  start.value = a
  end.value = b
}

function save() {
  if (!selected.value) return
  if (selected.value.length > LIMITS.expressionMax) {
    return toast(`一次最多收藏 ${LIMITS.expressionMax} 个字符`)
  }
  emit('save', selected.value)
}
</script>

<style lang="scss">
.pick {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 4px;
}

.pick__hint {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.pick__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick__token {
  padding: 11px 12px;
  border-radius: 8px;
  font-size: 17px;
  line-height: 22px;
  background-color: var(--sv-fill);
  transition:
    background-color var(--sv-dur-1) var(--sv-ease),
    color var(--sv-dur-1) var(--sv-ease);

  &.is-on {
    color: var(--sv-accent);
    background-color: var(--sv-accent-soft);
  }

  &.is-edge {
    font-weight: 600;
  }

  &.is-pressed {
    opacity: 0.6;
  }
}

.pick__preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: var(--sv-radius-s);
  background-color: var(--sv-fill);
}

.pick__selected {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}

.pick__placeholder {
  font-size: 15px;
  line-height: 24px;
  color: var(--sv-text-3);
}

.pick__saved {
  font-size: 13px;
  color: var(--sv-text-2);
}
</style>
