<template>
  <view class="revise" :style="barStyle">
    <view class="revise__bg" />
    <scroll-view class="revise__chips" scroll-x :enhanced="true" :show-scrollbar="false">
      <view class="revise__chips-inner">
        <sv-chip
          v-for="q in QUICK_INSTRUCTIONS"
          :key="q"
          :disabled="disabled"
          @click="emit('submit', q)"
        >
          {{ q }}
        </sv-chip>
      </view>
    </scroll-view>
    <view class="revise__row">
      <!-- 输入时不回写内容，避免打断中文输入法；发送后换新的输入框来清空 -->
      <input
        :key="inputVersion"
        class="revise__input"
        :placeholder="placeholder"
        placeholder-class="revise__placeholder"
        :maxlength="LIMITS.instructionMax"
        :adjust-position="false"
        confirm-type="send"
        @input="onInput"
        @confirm="send"
      />
      <view
        class="revise__send"
        :class="{ 'is-ready': canSend }"
        :hover-class="canSend ? 'is-pressed' : 'none'"
        @tap="send"
      >
        <sv-icon name="arrow.up" :size="18" :weight="2.6" color="var(--sv-text-on-accent)" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { LIMITS, QUICK_INSTRUCTIONS } from '@shared/constants'
import { useSystemStore } from '@/stores/system'
import { watchKeyboard } from '@/utils/keyboard'

const props = defineProps<{ modelValue: string; disabled: boolean; hint: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [instruction: string] }>()

const { metrics } = storeToRefs(useSystemStore())
const keyboardHeight = ref(0)
const inputVersion = ref(0)

function onKeyboard(res: { height: number }) {
  if (res.height !== keyboardHeight.value) keyboardHeight.value = res.height
}

// 外部把内容清空时（发送成功），换一个新的输入框
watch(
  () => props.modelValue,
  (value) => {
    if (value === '') inputVersion.value++
  },
)
const unwatchKeyboard = watchKeyboard(onKeyboard)
onUnmounted(unwatchKeyboard)

const barStyle = computed(() => {
  // 键盘弹起时贴着键盘，不再留安全区
  const padding = keyboardHeight.value > 0 ? 8 : metrics.value.safeAreaBottom + 8
  return `padding-bottom:${padding}px;bottom:${keyboardHeight.value}px`
})

const placeholder = computed(() => props.hint || '想怎么改？比如：换成跟老板说的语气')
const canSend = computed(() => !props.disabled && props.modelValue.trim().length > 0)

function onInput(e: { detail: { value: string } }) {
  emit('update:modelValue', e.detail.value)
}

function send() {
  if (canSend.value) emit('submit', props.modelValue.trim())
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.revise {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  padding-top: 10px;
  transition: bottom var(--sv-dur-keyboard) var(--sv-ease-out);
}

.revise__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--sv-bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid var(--sv-separator);
}

.revise__chips {
  position: relative;
  white-space: nowrap;
}

.revise__chips-inner {
  display: inline-flex;
  gap: 8px;
  padding: 0 16px;
}

.revise__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 0 16px;
}

.revise__input {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 16px;
  color: var(--sv-text);
  background-color: var(--sv-fill);
}

.revise__placeholder {
  color: var(--sv-text-3);
}

.revise__send {
  @include sv-hit-area;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--sv-fill-strong);
  transition:
    background-color var(--sv-dur-1) var(--sv-ease),
    transform var(--sv-dur-1) var(--sv-ease-spring);

  &.is-ready {
    background-image: var(--sv-accent-gradient);
  }

  &.is-pressed {
    transform: scale(0.9);
  }
}
</style>
