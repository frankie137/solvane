<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
  >
    <sv-nav-bar :title="navTitle" back :large="false" />

    <view class="report">
      <!-- Couldn't fetch the record: practice state unknown, so all we can do is retry -->
      <sv-card v-if="error && !practice" :padding="24">
        <sv-state icon="alert" tone="danger" title="练习记录加载失败" :description="error.message">
          <sv-button size="sm" :loading="loading" @click="run">重试</sv-button>
        </sv-state>
      </sv-card>

      <!-- Fetching the record: unknown whether scoring is done, so show a skeleton instead of
           flashing "Assessing" (「正在评测」) -->
      <view v-else-if="!practice" class="report__loading">
        <sv-card :padding="22"><sv-skeleton :rows="4" title /></sv-card>
      </view>

      <template v-else>
        <!-- Scoring failed: the cloud has withdrawn the scoring and refunded the use, and the
             page below falls back to "Recorded" (「录好了」) to score again. Practices from before
             M6 retry here -->
        <sv-card v-if="error" :padding="24">
          <sv-state icon="alert" tone="danger" title="评分没有完成" :description="error.message">
            <view v-if="practice.scoreRequested" class="actions">
              <sv-button v-if="canRetry" size="sm" :loading="scoring" @click="startScore">
                重试
              </sv-button>
              <sv-button type="secondary" size="sm" @click="reciteAgain">再背一次</sv-button>
            </view>
            <text v-else class="report__note">没评出来，这次不扣次数</text>
          </sv-state>
        </sv-card>

        <!-- Recorded, not yet scored: play back first and let the user decide whether to score;
             sharing works without scoring -->
        <view v-if="!practice.scoreRequested" class="report__result">
          <sv-card :padding="22">
            <text class="report__title">录好了</text>
            <text class="report__desc"
              >先听听自己背得怎么样。想知道发音和背诵哪里能改进，可以评个分。</text
            >
            <view class="recorded">
              <sv-button v-if="practice.audioUrl" type="secondary" block @click="toggleRecording">
                <sv-icon :name="playingAll ? 'stop.fill' : 'play.fill'" :size="14" />
                <text>{{ playingAll ? '停止' : '回放我的背诵' }}</text>
              </sv-button>
              <sv-button block haptic :loading="scoring" @click="startScore">
                <sv-icon name="waveform" :size="16" color="var(--sv-text-on-accent)" />
                <text>评分</text>
              </sv-button>
              <text v-if="scoreHint" class="recorded__hint">{{ scoreHint }}</text>
            </view>
          </sv-card>
        </view>

        <!-- Assessing -->
        <sv-card v-else-if="!done && !error" :padding="22">
          <text class="report__title">正在评测</text>
          <text class="report__desc"
            >大约需要 20～40 秒，可以先离开，稍后在对话页的练习记录里查看。</text
          >
          <view class="report__stages">
            <stage-progress :stage="practice.stage" :failed="false" />
          </view>
        </sv-card>
      </template>

      <!-- Assessment results -->
      <view v-if="done && practice && report" class="report__result">
        <sv-card :padding="22">
          <view class="summary">
            <score-ring :score="report.scores.overall" />
            <text class="summary__text">{{ report.summary }}</text>
          </view>
          <view class="metrics">
            <view v-for="m in metrics" :key="m.key" class="metric">
              <view class="metric__head">
                <text class="metric__name">{{ m.name }}</text>
                <text class="metric__value sv-en">{{ m.value }}</text>
              </view>
              <view class="metric__track">
                <view
                  class="metric__bar"
                  :class="`is-${m.tone}`"
                  :style="`width:${barsGrown ? m.value : 0}%`"
                />
              </view>
            </view>
          </view>
          <view v-if="practice.audioUrl" class="summary__play">
            <sv-button type="secondary" block @click="toggleRecording">
              <sv-icon :name="playingAll ? 'stop.fill' : 'play.fill'" :size="14" />
              <text>{{ playingAll ? '停止' : '回放我的背诵' }}</text>
            </sv-button>
          </view>
        </sv-card>

        <view class="block">
          <view class="block__head">
            <text class="block__label">你背的</text>
            <text class="block__legend">点单词看详情</text>
          </view>
          <sv-card :padding="2" radius="m">
            <view v-for="(row, i) in rows" :key="i" class="row" :class="{ 'has-divider': i > 0 }">
              <view v-if="row.words.length" class="row__words sv-en">
                <text
                  v-for="(w, j) in row.words"
                  :key="j"
                  class="row__word"
                  hover-class="is-pressed"
                  :hover-stay-time="60"
                  :class="`is-${toneOf(w)}`"
                  @tap="openWord(w)"
                  >{{ w.word }}</text
                >
              </view>
              <view v-else-if="row.unscored" class="row__unscored">
                <text class="row__spoken sv-en">{{ row.spoken }}</text>
                <text class="row__note">这一句没能评测发音，可以再背一次</text>
              </view>
              <text v-else class="row__missing">这一句没有背出来</text>
              <text class="row__ref sv-en">{{ row.original }}</text>
            </view>
          </sv-card>
        </view>

        <view v-if="practice.alignment?.diffs.length" class="block">
          <text class="block__label">和原文对照</text>
          <sv-card :padding="2" radius="m">
            <view
              v-for="(d, i) in practice.alignment.diffs"
              :key="i"
              class="diff"
              :class="{ 'has-divider': i > 0 }"
            >
              <text class="diff__kind" :class="`is-${d.kind}`">{{ DIFF_LABEL[d.kind] }}</text>
              <view class="diff__body">
                <text v-if="d.target" class="diff__target sv-en">原文：{{ d.target }}</text>
                <text v-if="d.said" class="diff__said sv-en">你说：{{ d.said }}</text>
                <text class="diff__note">{{ d.note }}</text>
              </view>
            </view>
          </sv-card>
        </view>

        <view v-if="report.pronunciationTips.length" class="block">
          <text class="block__label">发音建议</text>
          <sv-card :padding="2" radius="m">
            <view
              v-for="(t, i) in report.pronunciationTips"
              :key="i"
              class="tip"
              :class="{ 'has-divider': i > 0 }"
              hover-class="is-pressed"
              :hover-stay-time="60"
              @tap="playStandard(t.word)"
            >
              <view class="tip__head">
                <text class="tip__word sv-en">{{ t.word }}</text>
                <sv-icon name="speaker" :size="16" color="var(--sv-accent)" />
              </view>
              <text class="tip__text">{{ t.issue }}</text>
              <text class="tip__how">{{ t.howTo }}</text>
            </view>
          </sv-card>
        </view>

        <view v-if="report.recitationTips.length" class="block">
          <text class="block__label">背诵建议</text>
          <sv-card :padding="18" radius="m">
            <view class="advice">
              <text v-for="(t, i) in report.recitationTips" :key="i" class="advice__item">{{
                t
              }}</text>
            </view>
          </sv-card>
        </view>
      </view>

      <!-- Recorded or scored: share, go back, recite again. When not scored, "Score" (「评分」) is
           the primary button, so "Recite again" (「再背一次」) here becomes secondary -->
      <view v-if="practice && (!practice.scoreRequested || (done && report))" class="report__end">
        <view v-if="practice.audioUrl" class="share-entry">
          <sv-button type="plain" block :loading="shareFlow.state.busy" @click="sharePractice">
            <sv-icon name="share" :size="16" color="var(--sv-accent)" />
            <text>{{ shareFlow.state.preparing ? '正在准备歌词…' : '分享这次背诵' }}</text>
          </sv-button>
        </view>

        <view class="footer">
          <view class="footer__item">
            <sv-button type="secondary" block @click="backToSession">返回对话</sv-button>
          </view>
          <view class="footer__item">
            <sv-button
              :type="practice.scoreRequested ? 'primary' : 'secondary'"
              block
              :haptic="practice.scoreRequested"
              @click="reciteAgain"
              >再背一次</sv-button
            >
          </view>
        </view>
      </view>
    </view>

    <view class="bottom" />

    <view :style="bottomInset" />
  </scroll-view>

  <word-sheet
    v-model:show="sheet.show"
    :word="sheet.word"
    :tip="sheetTip"
    :can-play-mine="!!practice?.audioUrl && !!sheet.word && sheet.word.endMs > sheet.word.startMs"
    :loading-standard="sheet.loadingStandard"
    :saved="!!sheetSavedId"
    :saving="sheet.saving"
    @play-standard="sheet.word && playStandard(sheet.word.word)"
    @play-mine="playMine"
    @save="saveWord"
  />
  <folder-picker
    v-model:show="organizer.picker.show"
    :current="organizer.picker.current"
    @pick="organizer.onPick"
  />
  <profile-sheet
    v-model:show="shareFlow.state.sheet"
    title="设置署名"
    hint="好友打开分享时会看到「你的昵称 的朗读」，只需设置一次。"
    confirm-text="保存并分享"
    @saved="shareFlow.onProfileSaved"
  />
  <saved-toast
    :show="organizer.saved.show"
    :text="organizer.saved.text"
    :action="organizer.saved.action"
    :bottom="toastBottom"
    @action="organizer.onSavedAction"
  />
  <pro-sheet v-model:show="showPro" reason="quota" />
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { onHide, onLoad, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { DiffKind, Practice, ScoredWord, Version } from '@shared/types'
import FolderPicker from '@/components/library/FolderPicker.vue'
import ProSheet from '@/components/pro/ProSheet.vue'
import ProfileSheet from '@/components/profile/ProfileSheet.vue'
import SavedToast from '@/components/library/SavedToast.vue'
import { useAudio } from '@/composables/useAudio'
import { useOrganizer } from '@/composables/useOrganizer'
import { useShareFlow } from '@/composables/useShareFlow'
import { CloudError } from '@/services/cloud'
import { getPractice, runPractice, wordAudioPath } from '@/services/practice'
import { getSession } from '@/services/sessions'
import { useAccountStore } from '@/stores/account'
import { useLibraryStore } from '@/stores/library'
import { useSystemStore } from '@/stores/system'
import { canUse } from '@/utils/account'
import { toast } from '@/utils/dialog'
import { navigateTo } from '@/utils/nav'
import { scoreTone } from '@/utils/recite'
import ScoreRing from '../components/ScoreRing.vue'
import StageProgress from '../components/StageProgress.vue'
import WordSheet from '../components/WordSheet.vue'

const DIFF_LABEL: Record<DiffKind, string> = {
  mispronounced: '读错了',
  paraphrase: '换了说法',
  missing: '漏说了',
  extra: '多说了',
  grammar: '语法',
}

/** Extra padding before and after when playing back one of your own words, so it's heard in full */
const WORD_PADDING_MS = 80

const practiceId = ref('')
const practice = ref<Practice | null>(null)
const version = ref<Version | null>(null)
const error = ref<CloudError | null>(null)

const done = computed(() => practice.value?.stage === 'done')
const navTitle = computed(() =>
  practice.value && !practice.value.scoreRequested ? '练习记录' : '背诵报告',
)
const report = computed(() => practice.value?.report ?? null)

/**
 * Score bars start at 0 and grow to the score once results appear, animating together with the
 * score ring
 */
const barsGrown = ref(false)
watch(
  () => Boolean(done.value && report.value),
  (shown) => {
    if (!shown) return
    void nextTick(() =>
      setTimeout(() => {
        barsGrown.value = true
      }, 30),
    )
  },
  { immediate: true },
)

/** Retrying is pointless for config problems and "couldn't hear clearly" */
const canRetry = computed(() => !!practice.value && error.value?.code !== 'BAD_REQUEST')

let disposed = false
onUnload(() => {
  disposed = true
})

onLoad((query) => {
  practiceId.value = String(query?.practiceId ?? '')
  void run()
})

const loading = ref(false)
const scoring = ref(false)
const wasCancelled = (err: unknown) =>
  disposed || (err instanceof CloudError && err.code === 'CANCELLED')
const asError = (err: unknown) =>
  err instanceof CloudError ? err : new CloudError('INTERNAL', '评测失败，请重试')
const runOptions = {
  onUpdate: (p: Practice) => (practice.value = p),
  isCancelled: () => disposed,
}

async function run() {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    if (!practice.value) practice.value = await getPractice(practiceId.value)
    void loadVersion()
    // Left mid-scoring: continue scoring (the use won't be charged twice)
    if (practice.value.scoreRequested && practice.value.stage !== 'done') {
      scoring.value = true
      practice.value = await runPractice(practiceId.value, 'score', runOptions)
    }
  } catch (err) {
    if (!wasCancelled(err)) error.value = asError(err)
  } finally {
    loading.value = false
    scoring.value = false
  }
}

// --- Scoring ----------------------------------------------------------------

const accountStore = useAccountStore()
const { account } = storeToRefs(accountStore)
const showPro = ref(false)

const scoreHint = computed(() => {
  const a = account.value
  if (!a || a.isAdmin) return ''
  if (a.pro) return 'Pro 会员不限次数'
  return a.freeLeft > 0
    ? `免费体验还剩 ${a.freeLeft} 次（新建对话和评分合计）`
    : '免费体验已用完，开通 Pro 后可以评分'
})

/**
 * Scoring: uses one free use (none for Pro); on failure the cloud withdraws the scoring and refunds
 * the use, and the page returns to "Recorded" (「录好了」)
 */
async function startScore() {
  const p = practice.value
  if (!p || scoring.value) return
  if (!p.scoreRequested && !canUse(account.value)) {
    showPro.value = true
    return
  }
  audio.stop()
  playingAll.value = false
  scoring.value = true
  error.value = null
  // Switch to "Assessing" (「正在评测」) right away without waiting for the first step to return
  practice.value = { ...p, scoreRequested: true }
  try {
    practice.value = await runPractice(practiceId.value, 'score', runOptions)
  } catch (err) {
    if (wasCancelled(err)) return
    // The cloud is the source of truth: on failure the scoring request has been withdrawn
    practice.value = await getPractice(practiceId.value).catch(() => p)
    const e = asError(err)
    if (e.code === 'QUOTA_EXCEEDED') showPro.value = true
    else error.value = e
  } finally {
    scoring.value = false
    accountStore.refresh()
  }
}

/** The report shows the original text, used as a hint for sentences that weren't recited */
async function loadVersion() {
  if (version.value || !practice.value) return
  try {
    const session = await getSession(practice.value.sessionId)
    version.value = session.versions.find((v) => v.vid === practice.value?.vid) ?? null
  } catch {
    // The original text is only for comparison; failing to fetch it doesn't affect the score
  }
}

// --- Display ----------------------------------------------------------------

const metrics = computed(() => {
  const s = report.value?.scores
  if (!s) return []
  return [
    { key: 'pronunciation', name: '发音', value: s.pronunciation },
    { key: 'fluency', name: '流利度', value: s.fluency },
    { key: 'content', name: '内容还原', value: s.content },
    { key: 'expression', name: '表达正确', value: s.expression },
  ].map((m) => ({ ...m, tone: scoreTone(m.value) }))
})

/** Group by sentences of the original text: each shows its assessed words and the original */
const rows = computed(() => {
  const words = practice.value?.pronunciation?.words ?? []
  const count =
    version.value?.sentences.length ??
    Math.max(0, ...(practice.value?.alignment?.sentences.map((s) => s.index + 1) ?? [0]))
  const unscored = new Set(practice.value?.pronunciation?.unscored ?? [])
  const aligned = practice.value?.alignment?.sentences ?? []
  return Array.from({ length: count }, (_, index) => ({
    original: version.value?.sentences[index]?.en ?? '',
    words: words.filter((w) => w.sentenceIndex === index && w.match !== 'missing'),
    // Recited but unassessed sentences: show the reconstructed text; don't count them as missing
    unscored: unscored.has(index),
    spoken: aligned.find((a) => a.index === index)?.intended ?? '',
  }))
})

function toneOf(w: ScoredWord) {
  return w.match === 'extra' ? 'none' : scoreTone(w.accuracy)
}

// --- Playback ---------------------------------------------------------------

/**
 * The playback URL is temporary (expires in 2 hours): refetch it before playing once 90 minutes
 * have passed or after a playback error
 */
const AUDIO_TTL_MS = 90 * 60_000
let audioFetchedAt = Date.now()
const audio = useAudio(60, {
  onError: () => {
    audioFetchedAt = 0
  },
})
const playingAll = ref(false)

async function freshAudioUrl(): Promise<string | null> {
  if (practice.value && Date.now() - audioFetchedAt > AUDIO_TTL_MS) {
    try {
      practice.value = await getPractice(practiceId.value)
      audioFetchedAt = Date.now()
    } catch {
      // If refetching fails, try the old URL
    }
  }
  return practice.value?.audioUrl ?? null
}

async function toggleRecording() {
  if (playingAll.value) {
    audio.stop()
    playingAll.value = false
    return
  }
  const url = await freshAudioUrl()
  if (!url) return
  playingAll.value = true
  audio.play(url, { onEnded: () => (playingAll.value = false) })
}

const sheet = reactive<{
  show: boolean
  word: ScoredWord | null
  loadingStandard: boolean
  saving: boolean
}>({
  show: false,
  word: null,
  loadingStandard: false,
  saving: false,
})

// --- Share ------------------------------------------------------------------

const shareFlow = useShareFlow({
  isCancelled: () => disposed,
  onPrepared: (p) => (practice.value = p),
})

function sharePractice() {
  audio.stop()
  playingAll.value = false
  if (practice.value) void shareFlow.share(practice.value)
}

// --- Save words -------------------------------------------------------------

const libraryStore = useLibraryStore()
const organizer = useOrganizer()
const { metrics: system } = storeToRefs(useSystemStore())
const toastBottom = computed(() => system.value.safeAreaBottom + 24)

// Leave room for the bottom safe area so the last item doesn't touch the home indicator
const bottomInset = computed(() => `height:${system.value.safeAreaBottom + 24}px`)
if (!libraryStore.loaded) void libraryStore.refresh()

const sheetSavedId = computed(() => (sheet.word ? libraryStore.savedId(sheet.word.word) : null))

async function saveWord() {
  const p = practice.value
  const w = sheet.word
  if (!p || !w || sheet.saving) return
  const existing = sheetSavedId.value
  if (existing) {
    sheet.show = false
    navigateTo(`/pkg-library/expression/index?id=${encodeURIComponent(existing)}`)
    return
  }
  sheet.saving = true
  try {
    const { expression } = await libraryStore.save({
      text: w.word,
      kind: 'word',
      source: {
        sessionId: p.sessionId,
        vid: p.vid,
        sentenceIndex: w.sentenceIndex,
        from: 'report',
      },
    })
    sheet.show = false
    organizer.notifySaved({
      tab: 'expression',
      id: expression.id,
      folderId: expression.folderId,
      tags: expression.tags,
    })
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '收藏失败，请重试')
  } finally {
    sheet.saving = false
  }
}

const sheetTip = computed(() => {
  const w = sheet.word?.word.toLowerCase().replace(/[^a-z'-]/g, '')
  return report.value?.pronunciationTips.find((t) => t.word.toLowerCase() === w) ?? null
})

function openWord(w: ScoredWord) {
  audio.stop()
  playingAll.value = false
  sheet.word = w
  sheet.show = true
}

async function playStandard(word: string) {
  const clean = word.replace(/[^A-Za-z'-]/g, '')
  if (!clean || sheet.loadingStandard) return
  sheet.loadingStandard = true
  try {
    playingAll.value = false
    audio.play(await wordAudioPath(clean))
  } catch (err) {
    uni.showToast({ title: err instanceof CloudError ? err.message : '发音加载失败', icon: 'none' })
  } finally {
    sheet.loadingStandard = false
  }
}

async function playMine() {
  const w = sheet.word
  const url = await freshAudioUrl()
  if (!w || !url) return
  playingAll.value = false
  audio.play(url, {
    startMs: Math.max(0, w.startMs - WORD_PADDING_MS),
    endMs: w.endMs + WORD_PADDING_MS,
  })
}

onHide(() => {
  audio.stop()
  playingAll.value = false
})

// --- Navigation -------------------------------------------------------------

function reciteAgain() {
  const p = practice.value
  if (!p) return uni.navigateBack()
  uni.redirectTo({
    url: `/pkg-recite/recite/index?sessionId=${encodeURIComponent(p.sessionId)}&vid=${p.vid}`,
  })
}

function backToSession() {
  uni.navigateBack()
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.report {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 16px 0;
}

.report__loading,
.report__result {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.report__result {
  @include sv-appear;
}

.report__title {
  display: block;
  font-size: 20px;
  line-height: 25px;
  font-weight: 600;
}

.report__desc {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.report__stages {
  margin-top: 20px;
}

.report__note {
  font-size: 13px;
  color: var(--sv-text-2);
}

.recorded {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}

.recorded__hint {
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  color: var(--sv-text-2);
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.summary__text {
  font-size: 16px;
  line-height: 23px;
  text-align: center;
}

.summary__play {
  margin-top: 18px;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}

.metric__head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.metric__name {
  font-size: 14px;
  color: var(--sv-text-2);
}

.metric__value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metric__track {
  height: 6px;
  border-radius: 3px;
  background-color: var(--sv-fill);
  overflow: hidden;
}

.metric__bar {
  height: 100%;
  border-radius: 3px;
  transition: width var(--sv-dur-3) var(--sv-ease);

  &.is-good {
    background-color: var(--sv-success);
  }

  &.is-fair {
    background-color: var(--sv-warning);
  }

  &.is-poor {
    background-color: var(--sv-danger);
  }
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.block__label {
  padding: 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--sv-text-2);
}

.block__legend {
  font-size: 12px;
  color: var(--sv-text-3);
}

.has-divider::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 0.5px;
  background-color: var(--sv-separator);
}

.row,
.diff,
.tip {
  position: relative;
  padding: 14px 16px;
}

.row__words {
  font-size: 18px;
  line-height: 30px;
  font-weight: 600;
}

.row__word {
  display: inline-block;
  margin-right: 6px;
  padding: 0 2px;
  border-radius: 5px;

  &.is-good {
    color: var(--sv-success);
  }

  &.is-fair {
    color: var(--sv-warning);
  }

  &.is-poor {
    color: var(--sv-danger);
    background-color: var(--sv-fill);
  }

  &.is-none {
    color: var(--sv-text-2);
  }

  &.is-pressed {
    opacity: 0.55;
  }
}

.row__missing {
  display: block;
  font-size: 15px;
  color: var(--sv-danger);
}

.row__spoken {
  display: block;
  font-size: 17px;
  line-height: 25px;
  color: var(--sv-text);
}

.row__note {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-warning);
}

.row__ref {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-3);
}

.diff {
  display: flex;
  gap: 12px;
}

.diff__kind {
  flex-shrink: 0;
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sv-text-2);
  background-color: var(--sv-fill);

  &.is-paraphrase {
    color: var(--sv-success);
  }

  &.is-mispronounced,
  &.is-missing,
  &.is-grammar {
    color: var(--sv-danger);
  }
}

.diff__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diff__target {
  font-size: 15px;
  color: var(--sv-text-2);
}

.diff__said {
  font-size: 15px;
}

.diff__note {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.tip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.tip__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tip__word {
  font-size: 17px;
  font-weight: 600;
  color: var(--sv-accent);
}

.tip__text {
  font-size: 15px;
  line-height: 21px;
}

.tip__how {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.advice {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advice__item {
  font-size: 15px;
  line-height: 22px;
}

.report__end {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: -8px;
}

.footer {
  display: flex;
  gap: 12px;
}

.footer__item {
  flex: 1;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.bottom {
  height: 48px;
}
</style>
