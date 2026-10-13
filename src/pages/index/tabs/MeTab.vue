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
        <view class="profile" hover-class="is-pressed" :hover-stay-time="60" @tap="editProfile">
          <image
            v-if="profile?.avatarUrl"
            class="profile__avatar"
            :src="profile.avatarUrl"
            mode="aspectFill"
            @error="onAvatarError"
          />
          <view v-else class="profile__avatar">
            <sv-icon name="person.fill" :size="30" color="var(--sv-text-on-accent)" />
          </view>
          <view class="profile__info">
            <text class="sv-headline">{{ profile?.nickname || '设置头像和昵称' }}</text>
            <text class="sv-footnote sv-secondary">{{
              profile ? `分享时显示 · ${envLabel}` : `分享时会显示给好友 · ${envLabel}`
            }}</text>
          </view>
          <sv-icon name="chevron.right" :size="16" :weight="2.2" color="var(--sv-text-3)" />
        </view>
      </sv-card>

      <sv-group>
        <sv-cell
          title="会员"
          icon="crown"
          icon-bg="var(--sv-tint-orange)"
          arrow
          clickable
          @click="showPro = true"
        >
          <template #value>
            <text class="me__value" :class="{ 'is-warn': account && !canUse(account) }">{{
              account ? planLabel(account) : '—'
            }}</text>
          </template>
        </sv-cell>
        <sv-cell
          title="我的分享"
          icon="share"
          icon-bg="var(--sv-tint-cyan)"
          arrow
          clickable
          :divider="false"
          @click="openShares"
        />
      </sv-group>

      <sv-group
        v-if="account?.isAdmin"
        header="管理"
        footer="只有管理员能看到。大模型配置所有成员共用，费用计入你的 Key。"
      >
        <sv-cell
          title="会员管理"
          icon="people"
          icon-bg="var(--sv-tint-purple)"
          arrow
          clickable
          @click="openMembers"
        />
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
            <text class="me__value" :class="{ 'is-warn': llm === null }">{{ llmLabel }}</text>
          </template>
        </sv-cell>
      </sv-group>

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
        <sv-cell
          title="示范朗读"
          icon="speaker"
          icon-bg="var(--sv-tint-blue)"
          :value="ttsName"
          arrow
          clickable
          :divider="false"
          @click="chooseTts"
        />
      </sv-group>

      <sv-group header="关于" footer="开通 Pro 时把用户 ID 发给管理员，点一下即可复制。">
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

  <profile-sheet v-model:show="editingProfile" />
  <pro-sheet v-model:show="showPro" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ACCENTS, LEVELS, LLM_PRESETS, TTS_SPEEDS, TTS_VOICES } from '@shared/constants'
import type { UserSettings } from '@shared/types'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useTabBarInset } from '@/composables/useTabBarInset'
import { callCloud, CloudError } from '@/services/cloud'
import ProSheet from '@/components/pro/ProSheet.vue'
import ProfileSheet from '@/components/profile/ProfileSheet.vue'
import { useAccountStore } from '@/stores/account'
import { useProfileStore } from '@/stores/profile'
import { useSettingsStore } from '@/stores/settings'
import { canUse, planLabel } from '@/utils/account'
import { getEnvVersion } from '@/utils/env'
import { navigateTo } from '@/utils/nav'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()
const settingsStore = useSettingsStore()
const { settings, llm, loaded } = storeToRefs(settingsStore)

const accountStore = useAccountStore()
const { account } = storeToRefs(accountStore)
const showPro = ref(false)
let accountFailed = false

/**
 * Membership status (the home page already fetches it on show; here it's only fetched if that
 * failed or hasn't happened yet)
 */
async function loadAccount() {
  try {
    await accountStore.load()
    accountFailed = false
  } catch {
    // The failure reason shows on the "Cloud service" row (「云服务」); keep "—" here
    accountFailed = true
  }
}

// Only admins fetch the LLM config status; after that the config page updates it, so don't refetch
watch(
  () => account.value?.isAdmin,
  (admin) => {
    if (admin && llm.value === undefined) void settingsStore.loadLlm().catch(() => {})
  },
  { immediate: true },
)

const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)
const editingProfile = ref(false)
const profileFailed = ref(false)
/**
 * When the profile was last refetched because of an avatar error; avoids refetching over and over
 * when the avatar file itself is broken
 */
let avatarRetryAt = 0
const AVATAR_RETRY_GAP_MS = 60_000
let settingsFailed = false

async function loadProfile() {
  try {
    await profileStore.load()
    profileFailed.value = false
  } catch {
    // If it can't be fetched, show the default text and retry when the profile card is tapped
    profileFailed.value = true
  }
}
void loadProfile()

/** Avatar URL expired or broken: refetch the profile for a new URL, at most once a minute */
function onAvatarError() {
  if (Date.now() - avatarRetryAt < AVATAR_RETRY_GAP_MS) return
  avatarRetryAt = Date.now()
  void loadProfile()
}

async function editProfile() {
  if (profileFailed.value) {
    await loadProfile()
    if (profileFailed.value) {
      uni.showToast({ title: '资料加载失败，请稍后再试', icon: 'none' })
      return
    }
  }
  editingProfile.value = true
}

function openShares() {
  navigateTo('/pkg-share/mine/index')
}

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
const TTS_OPTIONS = TTS_VOICES.flatMap((v) =>
  TTS_SPEEDS.map((sp) => ({
    ttsVoice: v.id,
    ttsSpeed: sp.id,
    name: `${v.name.split(' ')[0]} · ${sp.name}`,
  })),
)

const ttsName = computed(() => {
  if (!loaded.value) return '—'
  const s = settings.value
  return TTS_OPTIONS.find((o) => o.ttsVoice === s.ttsVoice && o.ttsSpeed === s.ttsSpeed)?.name ?? ''
})

const llmLabel = computed(() => {
  if (llm.value === undefined) return '—'
  if (llm.value === null) return '未配置'
  const preset = llm.value.preset
  return LLM_PRESETS.find((p) => p.id === preset)?.name ?? '已配置'
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
    // The cloud service is back: reload what failed earlier (don't resend requests still in flight)
    if (settingsFailed) void loadSettings()
    if (accountFailed) void loadAccount()
  } catch (err) {
    cloud.state = 'error'
    cloud.message = err instanceof CloudError ? err.message : '连接失败'
  } finally {
    inFlight = false
  }
}

async function loadSettings(): Promise<boolean> {
  try {
    await settingsStore.load()
    settingsFailed = false
    return true
  } catch {
    settingsFailed = true
    // The failure reason shows on the "Cloud service" row (「云服务」); keep "—" here.
    // Settings reload when a setting item is tapped
    return false
  }
}

/** A setting was tapped before settings loaded: reload first, then open it on success */
async function ensureSettings(): Promise<boolean> {
  if (loaded.value) return true
  uni.showLoading({ title: '加载设置…' })
  const ok = await loadSettings()
  uni.hideLoading()
  if (!ok) uni.showToast({ title: '设置加载失败，请稍后再试', icon: 'none' })
  return ok
}

async function chooseLevel() {
  if (!(await ensureSettings())) return
  uni.showActionSheet({
    itemList: LEVELS.map((l) => `${l.name} · ${l.hint}`),
    success: ({ tapIndex }) => {
      const level = LEVELS[tapIndex]
      if (level) void updateSettings({ level: level.id })
    },
  })
}

async function chooseAccent() {
  if (!(await ensureSettings())) return
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
    uni.showToast({
      title: err instanceof CloudError ? err.message : '保存失败，请重试',
      icon: 'none',
    })
  }
}

async function chooseTts() {
  if (!(await ensureSettings())) return
  uni.showActionSheet({
    itemList: TTS_OPTIONS.map((o) => o.name),
    success: ({ tapIndex }) => {
      const o = TTS_OPTIONS[tapIndex]
      if (o) void updateSettings({ ttsVoice: o.ttsVoice, ttsSpeed: o.ttsSpeed })
    },
  })
}

function copyOpenid() {
  if (cloud.openid) uni.setClipboardData({ data: cloud.openid })
}

function openLlm() {
  navigateTo('/pkg-settings/llm/index')
}

function openMembers() {
  navigateTo('/pkg-admin/members/index')
}

function openGallery() {
  navigateTo('/pkg-dev/gallery/index')
}

onMounted(() => {
  void checkCloud()
  void loadSettings()
  if (!account.value) void loadAccount()
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
  transition: opacity var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    opacity: 0.6;
  }
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
  flex: 1;
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
