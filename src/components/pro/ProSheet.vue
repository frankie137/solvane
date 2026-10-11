<template>
  <sv-sheet :show="show" :title="title" @update:show="emit('update:show', $event)">
    <view class="pro">
      <view class="pro__head">
        <view class="pro__badge">
          <sv-icon name="crown" :size="28" color="var(--sv-text-on-accent)" />
        </view>
        <text class="pro__name">Solvane Pro</text>
        <text class="pro__price">{{ PRO.price }}</text>
        <text v-if="account" class="pro__status">当前：{{ planLabel(account) }}</text>
      </view>

      <view class="pro__perks">
        <view v-for="perk in PERKS" :key="perk.text" class="perk">
          <view class="perk__icon">
            <sv-icon :name="perk.icon" :size="16" color="var(--sv-accent)" />
          </view>
          <text class="perk__text">{{ perk.text }}</text>
        </view>
      </view>

      <text class="pro__free"
        >不开通也可以免费体验
        {{ PRO.freeTrials }} 次（新建对话和评分合计），录音、回放和分享不限次数。</text
      >

      <template v-if="!account?.isAdmin">
        <view class="pro__how">
          <text class="pro__how-title">怎么开通</text>
          <text class="pro__how-text"
            >付款后把用户 ID 发给管理员，由管理员开通
            {{ PRO.grantDays }} 天；还没到期时再开通，时间往后顺延。</text
          >
        </view>
        <sv-button block haptic :loading="copying" @click="copyOpenid">复制用户 ID</sv-button>
      </template>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { PRO } from '@shared/constants'
import type { IconName } from '@/components/sv-icon/icons'
import { CloudError } from '@/services/cloud'
import { useAccountStore } from '@/stores/account'
import { planLabel } from '@/utils/account'
import { toast } from '@/utils/dialog'

const props = withDefaults(
  defineProps<{
    show: boolean
    /** 因为次数用完而弹出时，标题直接说明原因 */
    reason?: 'quota' | 'info'
  }>(),
  { reason: 'info' },
)

const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'sparkles', text: '不限次数新建对话，生成地道表达和解析' },
  { icon: 'waveform', text: '不限次数评分：发音、流利度、内容还原逐项打分' },
  { icon: 'lightbulb', text: '每次评分都有发音建议和背诵建议' },
]

const store = useAccountStore()
const { account } = storeToRefs(store)
const title = computed(() => (props.reason === 'quota' ? '免费体验已用完' : '会员'))

// 每次打开都取一次最新状态（可能刚被管理员开通）
watch(
  () => props.show,
  (show) => {
    if (show) store.refresh()
  },
)

const copying = ref(false)
async function copyOpenid() {
  if (copying.value) return
  copying.value = true
  try {
    const { openid } = account.value ?? (await store.load())
    uni.setClipboardData({ data: openid })
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '复制失败，请重试')
  } finally {
    copying.value = false
  }
}
</script>

<style lang="scss">
.pro {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 8px;
}

.pro__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.pro__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 8px;
  border-radius: 28px;
  background-image: var(--sv-accent-gradient);
  box-shadow: var(--sv-shadow-glow);
}

.pro__name {
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
}

.pro__price {
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
  color: var(--sv-accent);
}

.pro__status {
  margin-top: 2px;
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-text-2);
}

.pro__perks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--sv-radius-m);
  background-color: var(--sv-fill);
}

.perk {
  display: flex;
  align-items: center;
  gap: 12px;
}

.perk__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background-color: var(--sv-accent-soft);
}

.perk__text {
  flex: 1;
  font-size: 15px;
  line-height: 21px;
}

.pro__free {
  padding: 0 4px;
  font-size: 13px;
  line-height: 19px;
  color: var(--sv-text-2);
}

.pro__how {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

.pro__how-title {
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
}

.pro__how-text {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}
</style>
