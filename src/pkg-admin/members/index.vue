<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="会员管理" back :collapsed="collapsed" />

    <view class="members">
      <sv-card v-if="error && members.length === 0" :padding="24">
        <sv-state icon="alert" tone="danger" title="成员加载失败" :description="error">
          <sv-button type="secondary" size="sm" @click="retry">重试</sv-button>
        </sv-state>
      </sv-card>

      <sv-card v-else-if="!loaded" :padding="18" radius="m"><sv-skeleton :rows="3" /></sv-card>

      <view v-else class="members__content">
        <text class="members__summary">{{ summary }}</text>
        <sv-card :padding="2" radius="m">
          <view
            v-for="(m, i) in members"
            :key="m.openid"
            class="member"
            :class="{ 'has-divider': i > 0 }"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="manage(m)"
          >
            <image v-if="m.avatarUrl" class="member__avatar" :src="m.avatarUrl" mode="aspectFill" />
            <view v-else class="member__avatar">
              <sv-icon name="person.fill" :size="20" color="var(--sv-text-on-accent)" />
            </view>
            <view class="member__info">
              <view class="member__head">
                <text class="member__name">{{ nameOf(m) }}</text>
                <text v-if="m.pro && !m.isAdmin" class="member__badge">Pro</text>
              </view>
              <text class="member__meta">{{ metaOf(m) }}</text>
            </view>
            <view v-if="busyId === m.openid" class="member__spinner" />
            <sv-icon
              v-else-if="!m.isAdmin"
              name="chevron.right"
              :size="16"
              :weight="2.2"
              color="var(--sv-text-3)"
            />
          </view>
        </sv-card>
        <text class="members__hint"
          >成员第一次打开小程序后出现在这里。朋友付款后，按他发来的用户 ID（末 4
          位）找到他，点一下开通 {{ PRO.grantDays }} 天；还没到期时再开通，时间往后顺延。</text
        >
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import { extendedUntil } from '@shared/account'
import { PRO } from '@shared/constants'
import type { Member } from '@shared/types'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { callCloud, CloudError } from '@/services/cloud'
import { useSystemStore } from '@/stores/system'
import { planLabel } from '@/utils/account'
import { chooseAction, confirmAction, toast } from '@/utils/dialog'
import { formatDate } from '@/utils/time'

const { metrics: systemMetrics } = storeToRefs(useSystemStore())
// Leave room for the bottom safe area so the last item doesn't touch the home indicator
const bottomInset = computed(() => `height:${systemMetrics.value.safeAreaBottom + 24}px`)

const { collapsed, onScroll } = useCollapsingTitle()
const members = ref<Member[]>([])
const loaded = ref(false)
const error = ref('')
/** Member whose Pro is being granted or ended, to prevent double taps */
const busyId = ref('')

async function load() {
  error.value = ''
  try {
    members.value = (await callCloud('data', 'listMembers', {})).members
  } catch (err) {
    error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
  } finally {
    loaded.value = true
  }
}

/** Retry: show loading first instead of flashing an empty list */
function retry() {
  loaded.value = false
  void load()
}

// Avatars are temporary URLs; refetch them every time the page is entered
onShow(() => void load())

const summary = computed(() => {
  const pro = members.value.filter((m) => m.pro && !m.isAdmin).length
  return `共 ${members.value.length} 人 · Pro ${pro} 人`
})

const idTail = (m: Member) => m.openid.slice(-4)

function nameOf(m: Member): string {
  return m.nickname || `用户 …${idTail(m)}`
}

function metaOf(m: Member): string {
  const parts = [planLabel(m)]
  if (!m.pro) parts.push(`已用 ${m.freeUsed} 次`)
  parts.push(`ID …${idTail(m)}`)
  return parts.join(' · ')
}

async function manage(m: Member) {
  if (busyId.value) return
  if (m.isAdmin) return toast('管理员不需要开通，一直不限次数')
  const items = m.pro ? [`再开通 ${PRO.grantDays} 天`, '结束 Pro'] : [`开通 ${PRO.grantDays} 天`]
  const index = await chooseAction(items)
  if (index === 0) await grant(m)
  else if (index === 1 && m.pro) await revoke(m)
}

async function grant(m: Member) {
  const until = extendedUntil(m.pro ? m.proUntil : null, Date.now())
  const ok = await confirmAction({
    title: `给「${nameOf(m)}」开通 Pro？`,
    content: `开通 ${PRO.grantDays} 天，到期日为 ${formatDate(until)}。请确认已经收到付款。`,
    confirmText: '开通',
  })
  if (ok) await run(m, 'grantPro', '已开通')
}

async function revoke(m: Member) {
  const ok = await confirmAction({
    title: `结束「${nameOf(m)}」的 Pro？`,
    content: '立即结束，之后按免费体验的剩余次数使用。',
    confirmText: '结束',
    danger: true,
  })
  if (ok) await run(m, 'revokePro', '已结束')
}

async function run(m: Member, action: 'grantPro' | 'revokePro', done: string) {
  busyId.value = m.openid
  try {
    const { member } = await callCloud('data', action, { openid: m.openid })
    members.value = members.value.map((x) => (x.openid === member.openid ? member : x))
    toast(done)
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '操作失败，请重试')
  } finally {
    busyId.value = ''
  }
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.members {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 0;
}

.members__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  @include sv-appear;
}

.members__summary {
  padding: 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--sv-text-2);
}

.members__hint {
  padding: 0 4px;
  font-size: 13px;
  line-height: 19px;
  color: var(--sv-text-2);
}

.member {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 68px;
    right: 16px;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.member__avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-image: var(--sv-accent-gradient);
}

.member__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.member__name {
  font-size: 16px;
  line-height: 21px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.member__badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  color: var(--sv-text-on-accent);
  background-image: var(--sv-accent-gradient);
}

.member__meta {
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-text-2);
}

.member__spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--sv-fill-strong);
  border-top-color: var(--sv-accent);
  @include sv-spinning(member-spin);
}
</style>
