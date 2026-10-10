<template>
  <scroll-view
    class="tab-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    @scroll="onScroll"
  >
    <sv-nav-bar title="练习" :collapsed="collapsed" />

    <view class="practice">
      <sv-card :padding="24">
        <view class="hero">
          <text class="hero__title sv-title-2">今天想说点什么？</text>
          <text class="hero__desc sv-subhead sv-secondary">
            用中文说出你的想法，哪怕只是只言片语，我来帮你变成地道的英文。
          </text>

          <view class="hero__mic-wrap">
            <view class="hero__ring" />
            <view class="hero__ring hero__ring--late" />
            <view
              class="hero__mic"
              :class="{ 'is-active': recorder.recording.value }"
              hover-class="is-pressed"
              :hover-stay-time="80"
              @tap="startRecording"
            >
              <sv-icon name="mic.fill" :size="34" color="var(--sv-text-on-accent)" :weight="2" />
            </view>
          </view>
          <text class="hero__hint sv-footnote sv-secondary">点一下开始说话 · 最长 60 秒</text>

          <sv-button type="secondary" size="sm" @click="openTextInput">
            <sv-icon name="keyboard" :size="18" />
            <text>打字输入</text>
          </sv-button>
        </view>
      </sv-card>

      <view class="section">
        <text class="section__title sv-title-3">最近对话</text>
        <recent-list
          :items="sessionsStore.recent"
          :loaded="sessionsStore.loaded"
          :error="sessionsStore.error"
          @open="openSession"
          @retry="sessionsStore.refresh()"
        />
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <recording-overlay
    :visible="recorder.recording.value"
    :levels="recorder.levels.value"
    :elapsed-ms="recorder.elapsedMs.value"
    @finish="recorder.stop(false)"
    @cancel="recorder.stop(true)"
  />

  <compose-sheet
    v-model:show="sheet.show"
    v-model:text="sheet.text"
    :mode="sheet.mode"
    :phase="sheet.phase"
    :error-message="sheet.error"
    :submitting="sheet.submitting"
    @submit="submit"
    @switch-to-text="openTextInput"
  />
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { InputMode } from '@shared/types'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useRecorder, type RecordingResult } from '@/composables/useRecorder'
import { useTabBarInset } from '@/composables/useTabBarInset'
import { callCloud, CloudError, uploadFile } from '@/services/cloud'
import { createSession } from '@/services/sessions'
import { useSessionsStore } from '@/stores/sessions'
import ComposeSheet, { type ComposePhase } from '../components/ComposeSheet.vue'
import RecentList from '../components/RecentList.vue'
import RecordingOverlay from '../components/RecordingOverlay.vue'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()
const sessionsStore = useSessionsStore()

const sheet = reactive<{
  show: boolean
  mode: InputMode
  phase: ComposePhase
  text: string
  error: string
  submitting: boolean
}>({ show: false, mode: 'voice', phase: 'editing', text: '', error: '', submitting: false })

/** 每次识别的编号：面板关掉或重新开始后，旧的识别结果直接丢弃 */
let recognizeToken = 0

watch(
  () => sheet.show,
  (show) => {
    if (!show) recognizeToken++
  },
)

const recorder = useRecorder(recognize)
function startRecording() {
  void recorder.start()
}

async function recognize(result: RecordingResult) {
  const token = ++recognizeToken
  Object.assign(sheet, { show: true, mode: 'voice', phase: 'recognizing', text: '', error: '' })
  try {
    const cloudPath = `voice-input/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pcm`
    const fileID = await uploadFile(result.tempFilePath, cloudPath)
    const { text } = await callCloud('speech', 'recognize', { fileID })
    if (token !== recognizeToken) return
    Object.assign(sheet, { phase: 'editing', text })
  } catch (err) {
    if (token !== recognizeToken) return
    Object.assign(sheet, {
      phase: 'error',
      error: err instanceof CloudError ? err.message : '识别失败，请重试',
    })
  }
}

function openTextInput() {
  recognizeToken++
  Object.assign(sheet, { show: true, mode: 'text', phase: 'editing', text: '', error: '' })
}

async function submit() {
  const text = sheet.text.trim()
  if (!text || sheet.submitting) return
  sheet.submitting = true
  try {
    const id = await createSession(sheet.mode, text)
    sheet.show = false
    openSession(id)
  } catch (err) {
    uni.showToast({
      title: err instanceof CloudError ? err.message : '创建失败，请重试',
      icon: 'none',
    })
  } finally {
    sheet.submitting = false
  }
}

function openSession(id: string) {
  uni.navigateTo({ url: `/pkg-session/session/index?id=${encodeURIComponent(id)}` })
}
</script>

<style lang="scss">
.tab-scroll {
  height: 100%;
}

.practice {
  padding: 0 16px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero__desc {
  margin-top: 8px;
  max-width: 280px;
}

.hero__mic-wrap {
  position: relative;
  width: 132px;
  height: 132px;
  margin: 28px 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero__mic {
  position: relative;
  z-index: 1;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: var(--sv-accent-gradient);
  box-shadow: 0 10px 30px var(--sv-accent-glow);
  transition:
    transform var(--sv-dur-2) var(--sv-ease-spring),
    box-shadow var(--sv-dur-2) var(--sv-ease);

  &.is-pressed {
    transform: scale(0.94);
  }

  &.is-active {
    transform: scale(1.08);
    box-shadow: 0 14px 40px var(--sv-accent-glow);
  }
}

// 两圈错开的呼吸光晕，提示这里可以按
.hero__ring {
  position: absolute;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background-color: var(--sv-accent-soft);
  animation: sv-breathe 2.8s var(--sv-ease) infinite;
  animation-play-state: var(--sv-play);
}

.hero__ring--late {
  animation-delay: 1.4s;
}

.hero__hint {
  margin-bottom: 16px;
}

.section {
  margin-top: 28px;
}

.section__title {
  display: block;
  margin: 0 4px 12px;
}

@keyframes sv-breathe {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.55);
    opacity: 0;
  }
}
</style>
