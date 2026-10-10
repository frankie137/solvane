<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
  >
    <sv-nav-bar title="背诵" back :large="false" />

    <view class="recite">
      <sv-card v-if="loadError" :padding="24">
        <sv-state icon="alert" tone="danger" title="背诵内容加载失败" :description="loadError">
          <sv-button type="secondary" size="sm" @click="load">重试</sv-button>
        </sv-state>
      </sv-card>

      <view v-else-if="!version" class="recite__loading">
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="4" title /></sv-card>
      </view>

      <view v-else class="recite__content">
        <view class="intro">
          <text class="intro__title">遮住原文，把这段背出来</text>
          <text class="intro__desc">
            看着中文回忆英文。想不起来时点那一句：先给首字母，再给整句。
          </text>
        </view>

        <sv-card :padding="2" radius="m">
          <masked-sentences
            :sentences="version.sentences"
            :levels="levels"
            :active-sentence="activeSentence"
            :active-token="activeToken"
            @tap-sentence="cycleHint"
          />
        </sv-card>

        <view class="tools">
          <sv-chip :disabled="recorder.recording.value" @click="toggleDemo">
            <sv-icon :name="demoPlaying ? 'stop.fill' : 'play.fill'" :size="14" />
            <text>{{ demoPlaying ? '停止' : demoLoading ? '加载中…' : '听示范' }}</text>
          </sv-chip>
          <sv-chip :disabled="allShown" @click="hintAll">全部提示一级</sv-chip>
          <sv-chip :disabled="allHidden" @click="hideAll">全部遮住</sv-chip>
        </view>
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <recite-panel
    v-if="version"
    :recording="recorder.recording.value"
    :submitting="submitting"
    :failed="!!failedRecording"
    :levels="recorder.levels.value"
    :elapsed-ms="recorder.elapsedMs.value"
    @start="startRecording"
    @finish="recorder.stop(false)"
    @cancel="recorder.stop(true)"
    @resubmit="resubmit"
    @discard="failedRecording = null"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { Version } from '@shared/types'
import { LIMITS } from '@shared/constants'
import { useDemoPlayer } from '@/composables/useDemoPlayer'
import { useRecorder, type RecordingResult } from '@/composables/useRecorder'
import { CloudError } from '@/services/cloud'
import { startPractice } from '@/services/practice'
import { getSession } from '@/services/sessions'
import { useSystemStore } from '@/stores/system'
import { nextHint, type HintLevel } from '@/utils/recite'
import MaskedSentences from '../components/MaskedSentences.vue'
import RecitePanel from '../components/RecitePanel.vue'

/** 底部录音面板的内容高度（不含安全区） */
const PANEL_HEIGHT = 150

const sessionId = ref('')
const vid = ref<string | null>(null)
const version = ref<Version | null>(null)
const loadError = ref('')
const levels = ref<HintLevel[]>([])
const submitting = ref(false)

const { metrics } = storeToRefs(useSystemStore())
const bottomInset = computed(() => `height:${PANEL_HEIGHT + metrics.value.safeAreaBottom + 24}px`)

const sentences = computed(() => version.value?.sentences ?? [])
const allHidden = computed(() => levels.value.every((l) => l === 0))
const allShown = computed(() => levels.value.every((l) => l === 2))

onLoad((query) => {
  sessionId.value = String(query?.sessionId ?? '')
  vid.value = query?.vid ? String(query.vid) : null
  void load()
})

async function load() {
  loadError.value = ''
  try {
    const session = await getSession(sessionId.value)
    const v = session.versions.find((x) => x.vid === vid.value)
    if (!v) throw new CloudError('NOT_FOUND', '要背诵的版本已不存在')
    version.value = v
    levels.value = v.sentences.map(() => 0)
  } catch (err) {
    loadError.value = err instanceof CloudError ? err.message : '请检查网络后重试'
  }
}

// --- 提示 -------------------------------------------------------------------

function cycleHint(index: number) {
  levels.value = levels.value.map((l, i) => (i === index ? nextHint(l) : l))
}

function hintAll() {
  levels.value = levels.value.map((l) => (l < 2 ? ((l + 1) as HintLevel) : l))
}

function hideAll() {
  levels.value = levels.value.map(() => 0)
}

// --- 示范朗读 ---------------------------------------------------------------

const {
  playing: demoPlaying,
  loading: demoLoading,
  activeSentence,
  activeToken,
  playAll,
  stop: stopDemo,
} = useDemoPlayer(sessionId, vid, sentences)

function toggleDemo() {
  if (demoPlaying.value) stopDemo()
  else void playAll()
}

onHide(() => {
  stopDemo()
})

// --- 录音与提交 -------------------------------------------------------------

const recorder = useRecorder(submit, { maxMs: LIMITS.reciteMaxMs })

function startRecording() {
  stopDemo()
  void recorder.start()
}

/** 提交失败时保留录音，可以重新提交 */
const failedRecording = ref<RecordingResult | null>(null)

function resubmit() {
  const result = failedRecording.value
  if (result) void submit(result)
}

async function submit(result: RecordingResult) {
  if (!vid.value || submitting.value) return
  submitting.value = true
  failedRecording.value = null
  try {
    const practiceId = await startPractice(sessionId.value, vid.value, result)
    // 替换当前页：报告页返回时直接回到对话页
    uni.redirectTo({ url: `/pkg-recite/report/index?practiceId=${encodeURIComponent(practiceId)}` })
  } catch (err) {
    failedRecording.value = result
    uni.showToast({
      title: err instanceof CloudError ? err.message : '提交失败，请重试',
      icon: 'none',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.recite {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 0;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

.intro__title {
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
}

.intro__desc {
  font-size: 15px;
  line-height: 21px;
  color: var(--sv-text-2);
}

.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recite__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  @include sv-appear;
}
</style>
