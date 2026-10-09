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

      <sv-group header="学习偏好" footer="这些设置将在 M1 开放。">
        <sv-cell
          title="英语水平"
          icon="graduation"
          icon-bg="var(--sv-tint-indigo)"
          value="即将开放"
        />
        <sv-cell title="口音" icon="globe" icon-bg="var(--sv-tint-blue)" value="即将开放" />
        <sv-cell title="示范朗读" icon="speaker" icon-bg="var(--sv-tint-orange)" value="即将开放" />
        <sv-cell
          title="大模型配置"
          icon="sliders"
          icon-bg="var(--sv-tint-green)"
          value="即将开放"
          :divider="false"
        />
      </sv-group>

      <sv-group header="关于">
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
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useTabBarInset } from '@/composables/useTabBarInset'
import { callCloud, CloudError } from '@/services/cloud'
import { getEnvVersion } from '@/utils/env'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()

const version = __APP_VERSION__
const env = getEnvVersion()
const envLabel = { develop: '开发版', trial: '体验版', release: '正式版' }[env]
const showGallery = env === 'develop'

const cloud = reactive<{ state: 'checking' | 'ok' | 'error'; latency: number; message: string }>({
  state: 'checking',
  latency: 0,
  message: '',
})

const cloudText = computed(() => {
  if (cloud.state === 'checking') return '检测中…'
  if (cloud.state === 'ok') return `已连通 · ${cloud.latency}ms`
  return cloud.message
})

let inFlight = false

async function checkCloud() {
  if (inFlight) return
  inFlight = true
  cloud.state = 'checking'
  const start = Date.now()
  try {
    await callCloud('data', 'ping', {})
    cloud.latency = Date.now() - start
    cloud.state = 'ok'
  } catch (err) {
    cloud.state = 'error'
    cloud.message = err instanceof CloudError ? err.message : '连接失败'
  } finally {
    inFlight = false
  }
}

function openGallery() {
  uni.navigateTo({ url: '/pkg-dev/gallery/index' })
}

onMounted(checkCloud)
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
