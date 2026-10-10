<template>
  <sv-sheet :show="show" :title="title" :mask-closable="!submitting" @update:show="onShow">
    <view class="compose">
      <view v-if="phase === 'recognizing'" class="compose__loading">
        <sv-skeleton :rows="3" />
        <text class="compose__hint">正在识别你说的话…</text>
      </view>

      <view v-else-if="phase === 'error'" class="compose__error">
        <sv-state icon="alert" tone="danger" title="没有识别出来" :description="errorMessage" />
        <view class="compose__actions">
          <sv-button type="secondary" @click="emit('switch-to-text')">改用打字</sv-button>
          <sv-button @click="emit('retry-voice')">重新说一次</sv-button>
        </view>
      </view>

      <view v-else class="compose__edit">
        <!-- 只在打开或识别完成时写入初始内容，打字过程中不回写，避免打断中文输入法 -->
        <textarea
          :key="seedVersion"
          class="compose__textarea"
          :value="seed"
          :maxlength="LIMITS.rawTextMax"
          :focus="focusRequested"
          :adjust-position="false"
          :show-confirm-bar="false"
          :disable-default-padding="true"
          placeholder="用中文说说你想表达什么，零碎一点也没关系"
          placeholder-class="compose__placeholder"
          @input="onInput"
          @blur="focusRequested = false"
        />
        <view class="compose__footer">
          <text class="compose__count">{{ text.length }} / {{ LIMITS.rawTextMax }}</text>
          <sv-button :disabled="!text.trim()" :loading="submitting" haptic @click="emit('submit')">
            <sv-icon name="sparkles" :size="18" color="var(--sv-text-on-accent)" />
            <text>生成地道表达</text>
          </sv-button>
        </view>
      </view>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LIMITS } from '@shared/constants'
import type { InputMode } from '@shared/types'

export type ComposePhase = 'recognizing' | 'editing' | 'error'

const props = defineProps<{
  show: boolean
  mode: InputMode
  phase: ComposePhase
  text: string
  errorMessage: string
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:text': [value: string]
  submit: []
  'switch-to-text': []
  'retry-voice': []
}>()

const title = computed(() => (props.mode === 'voice' ? '确认你说的话' : '写下你想说的'))

/** 写进输入框的初始内容；打字时不跟着变 */
const seed = ref('')
/** 每次重新进入编辑都换一个新的输入框，避免沿用上一次没清掉的内容 */
const seedVersion = ref(0)
/** 只在进入编辑时请求一次聚焦；键盘收起后不再抢焦点 */
const focusRequested = ref(false)

watch(
  () => [props.show, props.phase, props.mode] as const,
  ([show, phase, mode], previous) => {
    const entering =
      show &&
      phase === 'editing' &&
      (!previous || !previous[0] || previous[1] !== 'editing' || previous[2] !== mode)
    if (!entering) return
    seed.value = props.text
    seedVersion.value++
    // 打字输入时自动弹出键盘；语音识别后先让人看一眼结果
    focusRequested.value = mode === 'text'
  },
  { immediate: true },
)

function onShow(value: boolean) {
  emit('update:show', value)
}

function onInput(e: { detail: { value: string } }) {
  emit('update:text', e.detail.value)
}
</script>

<style lang="scss">
.compose {
  padding-bottom: 8px;
}

.compose__loading {
  padding: 8px 0 16px;
}

.compose__hint {
  display: block;
  margin-top: 14px;
  font-size: 15px;
  color: var(--sv-text-2);
}

.compose__error {
  padding: 8px 0 4px;
}

.compose__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.compose__textarea {
  box-sizing: border-box;
  width: 100%;
  height: 160px;
  padding: 14px 16px;
  border-radius: var(--sv-radius-m);
  font-size: 17px;
  line-height: 26px;
  color: var(--sv-text);
  background-color: var(--sv-fill);
}

.compose__placeholder {
  color: var(--sv-text-3);
}

.compose__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.compose__count {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--sv-text-3);
}
</style>
