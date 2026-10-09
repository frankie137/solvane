<template>
  <scroll-view
    class="tab-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="我的" :collapsed="collapsed" />

    <view class="me">
      <sv-card :padding="20">
        <view class="profile">
          <view class="profile__avatar">
            <sv-icon name="person.fill" :size="30" color="var(--sv-text-on-accent)" />
          </view>
          <view class="profile__info">
            <text class="sv-headline">Solvane 用户</text>
            <text class="sv-footnote sv-secondary">{{ envLabel }}</text>
          </view>
        </view>
      </sv-card>

      <sv-group header="学习偏好" footer="英语水平决定用词和句式的难度，口吻始终是日常对话。">
        <sv-cell
          title="英语水平"
          icon="graduation"
          icon-bg="var(--sv-tint-indigo)"
          :value="levelName"
          arrow
          clickable
          @click="chooseLevel"
        />
        <sv-cell
          title="口音"
          icon="globe"
          icon-bg="var(--sv-tint-blue)"
          :value="accentName"
          arrow
          clickable
          @click="chooseAccent"
        />
        <sv-cell title="示范朗读" icon="speaker" icon-bg="var(--sv-tint-orange)" value="M2 开放" />
        <sv-cell
          title="大模型配置"
          icon="sliders"
          icon-bg="var(--sv-tint-green)"
          arrow
          clickable
          :divider="false"
          @click="openLlm"
        >
          <template #value>
            <text class="me__value" :class="{ 'is-warn': llmLabel === '未配置' }">{{
              llmLabel
            }}</text>
          </template>
        </sv-cell>
      </sv-group>

      <sv-group
        header="关于"
        footer="用户 ID 用于设置管理员：填到 compose 云函数的 ADMIN_OPENIDS。"
      >
        <sv-cell
          title="云服务"
          icon="cloud"
          icon-bg="var(--sv-tint-cyan)"
          clickable
          @click="checkCloud"
        >
          <template #value>
            <text class="me__status" :class="`is-${cloud.state}`">{{ cloudText }}</text>
          </template>
        </sv-cell>
        <sv-cell
          title="用户 ID"
          icon="person"
          icon-bg="var(--sv-tint-purple)"
          :value="maskedOpenid"
          :clickable="Boolean(cloud.openid)"
          @click="copyOpenid"
        />
        <sv-cell
          title="版本"
          icon="info"
          icon-bg="var(--sv-tint-gray)"
          :value="`v${version}`"
          :divider="showGallery"
        />
        <sv-cell
          v-if="showGallery"
          title="组件预览"
          icon="grid"
          icon-bg="var(--sv-tint-purple)"
          arrow
          clickable
          :divider="false"
          @click="openGallery"
        />
      </sv-group>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { ACCENTS, LEVELS } from '@shared/constants'
import type { UserSettings } from '@shared/types'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useTabBarInset } from '@/composables/useTabBarInset'
import { callCloud, CloudError } from '@/services/cloud'
import { useSettingsStore } from '@/stores/settings'
import { getEnvVersion } from '@/utils/env'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()
const settingsStore = useSettingsStore()
const { settings, llm, loaded } = storeToRefs(settingsStore)

const version = __APP_VERSION__
const env = getEnvVersion()
const envLabel = { develop: '开发版', trial: '体验版', release: '正式版' }[env]
const showGallery = env === 'develop'

const levelName = computed(() =>
  loaded.value ? (LEVELS.find((l) => l.id === settings.value.level)?.name ?? '') : '—',
)
const accentName = computed(() =>
  loaded.value ? (ACCENTS.find((a) => a.id === settings.value.accent)?.name ?? '') : '—',
)
const llmLabel = computed(() => {
  if (!llm.value) return '—'
  return { own: '我的配置', global: '管理员默认', none: '未配置' }[llm.value.effective]
})

const cloud = reactive<{
  state: 'checking' | 'ok' | 'error'
  latency: number
  message: string
  openid: string
}>({ state: 'checking', latency: 0, message: '', openid: '' })

const cloudText = computed(() => {
  if (cloud.state === 'checking') return '检测中…'
  if (cloud.state === 'ok') return `已连通 · ${cloud.latency}ms`
  return cloud.message
})

const maskedOpenid = computed(() =>
  cloud.openid ? `${cloud.openid.slice(0, 6)}…${cloud.openid.slice(-4)}` : '—',
)

let inFlight = false

async function checkCloud() {
  if (inFlight) return
  inFlight = true
  cloud.state = 'checking'
  const start = Date.now()
  try {
    const res = await callCloud('data', 'ping', {})
    cloud.latency = Date.now() - start
    cloud.openid = res.openid
    cloud.state = 'ok'
  } catch (err) {
    cloud.state = 'error'
    cloud.message = err instanceof CloudError ? err.message : '连接失败'
  } finally {
    inFlight = false
  }
}

async function loadSettings() {
  try {
    await settingsStore.load()
  } catch {
    // 失败原因会显示在"云服务"那一行，这里保持"—"
  }
}

function chooseLevel() {
  if (!loaded.value) return
  uni.showActionSheet({
    itemList: LEVELS.map((l) => `${l.name} · ${l.hint}`),
    success: ({ tapIndex }) => {
      const level = LEVELS[tapIndex]
      if (level) void updateSettings({ level: level.id })
    },
  })
}

function chooseAccent() {
  if (!loaded.value) return
  uni.showActionSheet({
    itemList: ACCENTS.map((a) => a.name),
    success: ({ tapIndex }) => {
      const accent = ACCENTS[tapIndex]
      if (accent) void updateSettings({ accent: accent.id })
    },
  })
}

async function updateSettings(patch: Partial<UserSettings>) {
  try {
    await settingsStore.update(patch)
  } catch (err) {
    uni.showToast({ title: err instanceof CloudError ? err.message : '保存失败', icon: 'none' })
  }
}

function copyOpenid() {
  if (cloud.openid) uni.setClipboardData({ data: cloud.openid })
}

function openLlm() {
  uni.navigateTo({ url: '/pkg-settings/llm/index' })
}

function openGallery() {
  uni.navigateTo({ url: '/pkg-dev/gallery/index' })
}

onMounted(() => {
  void checkCloud()
  void loadSettings()
})
</script>

<style lang="scss">
.me {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 0 16px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile__avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: var(--sv-accent-gradient);
}

.profile__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.me__value {
  font-size: 17px;
  color: var(--sv-text-2);

  &.is-warn {
    color: var(--sv-warning);
  }
}

.me__status {
  font-size: 15px;
  color: var(--sv-text-2);
  transition: color var(--sv-dur-1) var(--sv-ease);

  &.is-ok {
    color: var(--sv-success);
  }

  &.is-error {
    color: var(--sv-danger);
  }
}
</style>
