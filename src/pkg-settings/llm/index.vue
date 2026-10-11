<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
  >
    <sv-nav-bar title="大模型配置" back :large="false" />

    <view class="llm">
      <sv-card v-if="loadError" :padding="24">
        <sv-state icon="alert" tone="danger" title="配置加载失败" :description="loadError">
          <sv-button type="secondary" size="sm" @click="load">重试</sv-button>
        </sv-state>
      </sv-card>

      <view v-else-if="!loaded" class="llm__loading">
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="2" /></sv-card>
      </view>

      <view v-else class="llm__content">
        <sv-card :padding="18" radius="m">
          <view class="status">
            <view class="status__dot" :class="{ 'is-none': !saved }" />
            <view class="status__text">
              <text class="status__title">{{ saved ? '已配置' : '还没有配置' }}</text>
              <text class="status__desc">{{
                saved
                  ? '所有成员生成和评分都用这份配置。'
                  : '填写下面的配置后，所有成员才能生成英文表达。'
              }}</text>
            </view>
          </view>
        </sv-card>

        <sv-group
          footer="所有成员共用这份配置，费用计入这个 Key。Key 加密保存在云端；不填 Key 时沿用已保存的。"
        >
          <sv-cell title="服务商" :value="presetName" arrow clickable @click="choosePreset" />
          <sv-field
            v-model="form.baseUrl"
            label="接口地址"
            placeholder="https://"
            :maxlength="300"
          />
          <sv-field
            v-model="form.model"
            label="模型"
            :placeholder="preset.modelHint"
            :maxlength="100"
          />
          <sv-field
            v-model="form.apiKey"
            label="API Key"
            password
            :placeholder="saved ? `已保存 ${saved.apiKeyMask}` : '粘贴你的 API Key'"
            :divider="false"
          />
        </sv-group>

        <text v-if="testResult" class="test" :class="{ 'is-ok': testResult.ok }">
          {{ testResult.text }}
        </text>

        <view class="buttons">
          <view class="buttons__item">
            <sv-button
              type="secondary"
              block
              :loading="testing"
              :disabled="!canSubmit"
              @click="test"
            >
              测试连接
            </sv-button>
          </view>
          <view class="buttons__item">
            <sv-button block :loading="saving" :disabled="!canSubmit" haptic @click="save">
              保存
            </sv-button>
          </view>
        </view>

        <view v-if="saved" class="clear">
          <sv-button type="plain" size="sm" @click="clear">
            <text class="clear__text">清除配置</text>
          </sv-button>
        </view>
      </view>
    </view>

    <view class="bottom" />

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad } from '@dcloudio/uni-app'
import type { LlmConfigInput } from '@shared/api'
import { LLM_PRESETS, type LlmPreset } from '@shared/constants'
import type { LlmConfigView, LlmPresetId } from '@shared/types'
import { callCloud, CloudError } from '@/services/cloud'
import { useSettingsStore } from '@/stores/settings'
import { useSystemStore } from '@/stores/system'

const { metrics: systemMetrics } = storeToRefs(useSystemStore())
// 底部留出安全区，最后的内容不贴着手势条
const bottomInset = computed(() => `height:${systemMetrics.value.safeAreaBottom + 24}px`)

/** 只有管理员能进这个页面；所有成员共用这一份配置 */
const settingsStore = useSettingsStore()
const saved = ref<LlmConfigView | null>(null)
const loaded = ref(false)
const loadError = ref('')
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)

const form = reactive<{ preset: LlmPresetId; baseUrl: string; model: string; apiKey: string }>({
  preset: 'deepseek',
  baseUrl: '',
  model: '',
  apiKey: '',
})

const preset = computed<LlmPreset>(
  () => LLM_PRESETS.find((p) => p.id === form.preset) ?? LLM_PRESETS[0]!,
)
const presetName = computed(() => preset.value.name)
const canSubmit = computed(() =>
  Boolean(form.baseUrl.trim() && form.model.trim() && (form.apiKey.trim() || saved.value)),
)

function fillForm() {
  const view = saved.value
  const fallback = LLM_PRESETS[0]!
  Object.assign(form, {
    preset: view?.preset ?? fallback.id,
    baseUrl: view?.baseUrl ?? fallback.baseUrl,
    model: view?.model ?? fallback.defaultModel,
    apiKey: '',
  })
  testResult.value = null
}

function applyConfig(next: LlmConfigView | null) {
  saved.value = next
  loaded.value = true
  settingsStore.setLlm(next)
}

async function load() {
  loadError.value = ''
  try {
    applyConfig((await callCloud('compose', 'getLlmConfig', {})).config)
    fillForm()
  } catch (err) {
    loadError.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
  }
}

onLoad(() => {
  void load()
})

function choosePreset() {
  uni.showActionSheet({
    itemList: LLM_PRESETS.map((p) => p.name),
    success: ({ tapIndex }) => {
      const next = LLM_PRESETS[tapIndex]
      if (!next || next.id === form.preset) return
      const previous = preset.value
      form.preset = next.id
      if (next.id !== 'custom') form.baseUrl = next.baseUrl
      // 模型名没改过（为空或还是上一个预设的默认值）时，换成新预设的默认值
      if (!form.model || form.model === previous.defaultModel) form.model = next.defaultModel
      testResult.value = null
    },
  })
}

function input(): LlmConfigInput {
  return {
    preset: form.preset,
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    apiKey: form.apiKey.trim() || undefined,
  }
}

async function test() {
  if (testing.value || !canSubmit.value) return
  testing.value = true
  testResult.value = null
  try {
    const res = await callCloud('compose', 'testLlm', input())
    testResult.value = {
      ok: true,
      text: `连接成功 · ${res.latencyMs}ms · 模型回复「${res.reply}」`,
    }
  } catch (err) {
    testResult.value = { ok: false, text: err instanceof CloudError ? err.message : '连接失败' }
  } finally {
    testing.value = false
  }
}

async function save() {
  if (saving.value || !canSubmit.value) return
  saving.value = true
  try {
    applyConfig((await callCloud('compose', 'saveLlmConfig', input())).config)
    form.apiKey = ''
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (err) {
    uni.showToast({
      title: err instanceof CloudError ? err.message : '保存失败，请重试',
      icon: 'none',
    })
  } finally {
    saving.value = false
  }
}

function clear() {
  uni.showModal({
    title: '清除配置',
    content: '清除后，所有成员都无法生成和评分，直到重新配置。',
    confirmText: '清除',
    // 原生弹窗不支持 CSS 变量，这里用和 --sv-danger 一致的色值
    confirmColor: '#ff3b30',
    success: async (res) => {
      if (!res.confirm) return
      uni.showLoading({ title: '正在清除…', mask: true })
      try {
        applyConfig((await callCloud('compose', 'clearLlmConfig', {})).config)
        fillForm()
        uni.hideLoading()
        uni.showToast({ title: '已清除', icon: 'success' })
      } catch (err) {
        uni.hideLoading()
        uni.showToast({
          title: err instanceof CloudError ? err.message : '清除失败，请重试',
          icon: 'none',
        })
      }
    },
  })
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.llm {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 16px 0;
}

.status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.status__dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: var(--sv-success);

  &.is-none {
    background-color: var(--sv-warning);
  }
}

.status__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status__title {
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
}

.status__desc {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.test {
  padding: 0 4px;
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-danger);

  &.is-ok {
    color: var(--sv-success);
  }
}

.buttons {
  display: flex;
  gap: 12px;
}

.buttons__item {
  flex: 1;
}

.clear {
  display: flex;
  justify-content: center;
}

.clear__text {
  color: var(--sv-danger);
}

.bottom {
  height: 60px;
}

.llm__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  @include sv-appear;
}
</style>
