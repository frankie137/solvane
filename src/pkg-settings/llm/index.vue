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

      <view v-else-if="!state" class="llm__loading">
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="2" /></sv-card>
      </view>

      <template v-else>
        <sv-card :padding="18" radius="m">
          <view class="status">
            <view class="status__dot" :class="`is-${state.effective}`" />
            <view class="status__text">
              <text class="status__title">{{ EFFECTIVE_TEXT[state.effective] }}</text>
              <text class="status__desc">{{ effectiveDesc }}</text>
            </view>
          </view>
        </sv-card>

        <view v-if="state.isAdmin" class="scopes">
          <sv-chip :active="scope === 'own'" @click="switchScope('own')">我的配置</sv-chip>
          <sv-chip :active="scope === 'global'" @click="switchScope('global')">
            全局默认（所有成员）
          </sv-chip>
        </view>

        <sv-group :footer="footer">
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
            <text class="clear__text">清除{{ scope === 'own' ? '我的' : '全局默认' }}配置</text>
          </sv-button>
        </view>
      </template>
    </view>

    <view class="bottom" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { LlmConfigInput } from '@shared/api'
import { LLM_PRESETS, type LlmPreset } from '@shared/constants'
import type { LlmConfigState, LlmPresetId, LlmScope } from '@shared/types'
import { callCloud, CloudError } from '@/services/cloud'
import { useSettingsStore } from '@/stores/settings'

const EFFECTIVE_TEXT: Record<LlmConfigState['effective'], string> = {
  own: '正在使用我的配置',
  global: '正在使用管理员的默认配置',
  none: '还没有可用的配置',
}

const settingsStore = useSettingsStore()
const state = ref<LlmConfigState | null>(null)
const loadError = ref('')
const scope = ref<LlmScope>('own')
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
const saved = computed(() => (state.value ? state.value[scope.value] : null))
const canSubmit = computed(() =>
  Boolean(form.baseUrl.trim() && form.model.trim() && (form.apiKey.trim() || saved.value)),
)

const effectiveDesc = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.effective === 'own') return '你的配置优先于管理员的默认配置。'
  if (s.effective === 'global') return '你没有填写自己的配置，生成时会使用管理员设置的默认配置。'
  return '填写下面的配置后才能生成英文表达。'
})

const footer = computed(() =>
  scope.value === 'global'
    ? '全局默认会被所有没有自己配置的成员使用，费用计入这个 Key。Key 加密保存在云端。'
    : 'Key 加密保存在云端，只用于调用你填写的接口。不填 Key 时沿用已保存的。',
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

function applyState(next: LlmConfigState) {
  state.value = next
  settingsStore.setLlmState(next)
}

async function load() {
  loadError.value = ''
  try {
    applyState(await callCloud('compose', 'getLlmConfig', {}))
    fillForm()
  } catch (err) {
    loadError.value = err instanceof CloudError ? err.message : '加载失败'
  }
}

onLoad(() => {
  void load()
})

function switchScope(next: LlmScope) {
  if (scope.value === next) return
  scope.value = next
  fillForm()
}

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
    scope: scope.value,
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
    applyState(await callCloud('compose', 'saveLlmConfig', input()))
    form.apiKey = ''
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: err instanceof CloudError ? err.message : '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function clear() {
  uni.showModal({
    title: '清除配置',
    content:
      scope.value === 'own'
        ? '清除后，将使用管理员的默认配置（如果有）。'
        : '清除后，没有自己配置的成员将无法生成。',
    confirmText: '清除',
    // 原生弹窗不支持 CSS 变量，这里用和 --sv-danger 一致的色值
    confirmColor: '#ff3b30',
    success: async (res) => {
      if (!res.confirm) return
      try {
        applyState(await callCloud('compose', 'clearLlmConfig', { scope: scope.value }))
        fillForm()
      } catch (err) {
        uni.showToast({ title: err instanceof CloudError ? err.message : '清除失败', icon: 'none' })
      }
    },
  })
}
</script>

<style lang="scss">
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

.scopes {
  display: flex;
  gap: 8px;
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
</style>
