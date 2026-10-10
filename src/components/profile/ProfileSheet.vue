<template>
  <sv-sheet :show="show" :title="title" @update:show="emit('update:show', $event)">
    <view class="profile-form">
      <text v-if="hint" class="profile-form__hint">{{ hint }}</text>

      <!-- 微信的头像选择：原生按钮，去掉默认样式 -->
      <button class="profile-form__avatar" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image
          v-if="avatarShown"
          class="profile-form__image"
          :src="avatarShown"
          mode="aspectFill"
        />
        <view v-else class="profile-form__placeholder">
          <sv-icon name="person.fill" :size="34" color="var(--sv-text-on-accent)" />
        </view>
        <view class="profile-form__badge">
          <sv-icon name="pencil" :size="12" :weight="2.4" color="var(--sv-text-on-accent)" />
        </view>
      </button>
      <text class="profile-form__caption">点头像选择</text>

      <view class="profile-form__field">
        <text class="profile-form__label">昵称</text>
        <!-- 微信的昵称输入（可一键填入微信昵称）；输入时不回写内容，避免打断中文输入法 -->
        <input
          :key="inputVersion"
          class="profile-form__input"
          type="nickname"
          :value="seed"
          :maxlength="LIMITS.nicknameMax"
          placeholder="填写昵称"
          placeholder-class="profile-form__placeholder-text"
          :adjust-position="false"
          @input="onNickname"
          @blur="onNickname"
          @change="onNickname"
          @nicknamereview="onReview"
        />
      </view>

      <sv-button block haptic :loading="saving" @click="save">{{ confirmText }}</sv-button>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { LIMITS } from '@shared/constants'
import type { Profile } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { useProfileStore } from '@/stores/profile'
import { toast } from '@/utils/dialog'

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    hint?: string
    confirmText?: string
  }>(),
  { title: '头像和昵称', hint: '', confirmText: '保存' },
)

const emit = defineEmits<{ 'update:show': [value: boolean]; saved: [profile: Profile] }>()

const store = useProfileStore()
const { profile } = storeToRefs(store)
const nickname = ref('')
const seed = ref('')
const inputVersion = ref(0)
const pickedAvatar = ref('')
const saving = ref(false)

const avatarShown = computed(() => pickedAvatar.value || profile.value?.avatarUrl || '')

// 每次打开都从当前资料开始编辑
watch(
  () => props.show,
  (show) => {
    if (!show) return
    nickname.value = profile.value?.nickname ?? ''
    seed.value = nickname.value
    pickedAvatar.value = ''
    inputVersion.value++
  },
  { immediate: true },
)

function onChooseAvatar(e: unknown) {
  const url = (e as { detail?: { avatarUrl?: string } }).detail?.avatarUrl
  if (url) pickedAvatar.value = url
}

function onNickname(e: { detail: { value?: string } }) {
  if (typeof e.detail.value === 'string') nickname.value = e.detail.value
}

/** 微信在失焦后异步检查昵称，没通过时会清空输入框（不一定触发 input），这里同步清掉 */
function onReview(e: unknown) {
  const detail = (e as { detail?: { pass?: boolean; timeout?: boolean } }).detail
  if (detail?.pass === false && !detail.timeout) {
    nickname.value = ''
    seed.value = ''
    inputVersion.value++
    toast('这个昵称没有通过微信的检查，请换一个')
  }
}

async function save() {
  const name = nickname.value.trim()
  if (!name) return toast('请填写昵称')
  if (saving.value) return
  saving.value = true
  try {
    const saved = await store.save(name, pickedAvatar.value || undefined)
    emit('saved', saved)
    emit('update:show', false)
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '保存失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss">
.profile-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 4px;
}

.profile-form__hint {
  align-self: stretch;
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

// 原生按钮自带背景、边框和内边距，全部去掉
.profile-form__avatar {
  position: relative;
  width: 84px;
  height: 84px;
  margin: 8px 0 0;
  padding: 0;
  border-radius: 42px;
  background: transparent;
  line-height: normal;
  overflow: visible;

  &::after {
    border: none;
  }
}

.profile-form__image,
.profile-form__placeholder {
  width: 84px;
  height: 84px;
  border-radius: 42px;
}

.profile-form__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sv-accent-gradient);
}

.profile-form__badge {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  border: 2px solid var(--sv-surface);
  background-color: var(--sv-accent);
}

.profile-form__caption {
  font-size: 13px;
  color: var(--sv-text-2);
}

.profile-form__field {
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 14px;
  border-radius: var(--sv-radius-s);
  background-color: var(--sv-fill);
}

.profile-form__label {
  font-size: 16px;
  color: var(--sv-text-2);
}

.profile-form__input {
  flex: 1;
  height: 48px;
  font-size: 16px;
  color: var(--sv-text);
}

.profile-form__placeholder-text {
  color: var(--sv-text-3);
}
</style>
