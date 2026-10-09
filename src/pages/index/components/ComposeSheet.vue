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
        </view>
      </view>

      <view v-else class="compose__edit">
        <textarea
          class="compose__textarea"
          :value="text"
          :maxlength="LIMITS.rawTextMax"
          :focus="autoFocus"
          :adjust-position="false"
          :show-confirm-bar="false"
          :disable-default-padding="true"
          placeholder="用中文说说你想表达什么，零碎一点也没关系"
          placeholder-class="compose__placeholder"
          @input="onInput"
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
import { computed } from 'vue'
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
}>()

const title = computed(() => (props.mode === 'voice' ? '确认你说的话' : '写下你想说的'))
// 打字输入时自动弹出键盘；语音识别后先让人看一眼结果
const autoFocus = computed(() => props.show && props.mode === 'text' && props.phase === 'editing')

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
