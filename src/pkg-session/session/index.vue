<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
    :scroll-into-view="scrollTarget"
    :scroll-with-animation="true"
  >
    <sv-nav-bar :title="navTitle" back :large="false">
      <template #leading>
        <view v-if="session" class="star" hover-class="is-pressed" @tap="toggleStar">
          <sv-icon
            :name="session.starredAt ? 'bookmark.fill' : 'bookmark'"
            :size="21"
            color="var(--sv-accent)"
          />
        </view>
      </template>
    </sv-nav-bar>

    <view class="session">
      <sv-card v-if="loadError" :padding="24">
        <sv-state icon="alert" tone="danger" title="对话加载失败" :description="loadError.message">
          <sv-button type="secondary" size="sm" @click="reload">重试</sv-button>
        </sv-state>
      </sv-card>

      <view v-else-if="!session" class="block">
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="2" /></sv-card>
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="4" title /></sv-card>
      </view>

      <view v-else class="session__content">
        <view class="block">
          <text class="block__label">你说的</text>
          <sv-card :padding="16" radius="m">
            <text
              class="raw"
              :class="{ 'is-clamped': !rawExpanded }"
              @tap="rawExpanded = !rawExpanded"
              >{{ session.input.rawText }}</text
            >
          </sv-card>
        </view>

        <!-- No version yet: generating or failed -->
        <template v-if="!current">
          <sv-card v-if="genError" :padding="24">
            <sv-state
              icon="alert"
              tone="danger"
              title="没能生成表达"
              :description="genError.message"
            >
              <view class="actions">
                <sv-button
                  v-if="genError.code === 'NOT_CONFIGURED' && account?.isAdmin"
                  size="sm"
                  @click="openLlmSettings"
                >
                  去配置
                </sv-button>
                <sv-button
                  v-if="genError.code === 'QUOTA_EXCEEDED'"
                  size="sm"
                  @click="showPro = true"
                >
                  了解 Pro
                </sv-button>
                <sv-button type="secondary" size="sm" @click="generate">重试</sv-button>
              </view>
            </sv-state>
          </sv-card>
          <view v-else class="block">
            <text class="block__label is-live">{{ progressHint }}</text>
            <sv-card :padding="18" radius="m"><sv-skeleton :rows="2" /></sv-card>
            <sv-card :padding="18" radius="m"><sv-skeleton :rows="4" title /></sv-card>
          </view>
        </template>

        <template v-else>
          <view class="block">
            <text class="block__label">整理后的中文</text>
            <sv-card :padding="16" radius="m">
              <text class="polished">{{ session.polishedZh }}</text>
            </sv-card>
          </view>

          <view id="english" class="block">
            <view class="block__head">
              <text class="block__label">地道英文</text>
              <view class="copy" hover-class="is-pressed" @tap="copyEnglish">
                <sv-icon name="copy" :size="16" />
                <text>复制</text>
              </view>
            </view>

            <scroll-view
              v-if="session.versions.length > 1"
              class="versions"
              scroll-x
              :enhanced="true"
              :show-scrollbar="false"
            >
              <view class="versions__inner">
                <sv-chip
                  v-for="(v, i) in session.versions"
                  :key="v.vid"
                  :active="v.vid === current.vid"
                  :disabled="revising"
                  @click="selectVersion(v.vid)"
                >
                  {{ versionLabel(v, i) }}
                </sv-chip>
              </view>
            </scroll-view>

            <view class="english" :class="{ 'is-busy': revising }">
              <sv-card :padding="2" radius="m">
                <sentence-list
                  :sentences="current.sentences"
                  :active-sentence="activeSentence"
                  :located="located"
                  interactive
                  @select="playSentence"
                  @hold="openWordPicker"
                />
              </sv-card>
              <view v-if="revising" class="english__busy">
                <text>正在按「{{ pendingInstruction }}」修改…</text>
              </view>
            </view>

            <view class="english__actions">
              <view class="english__action">
                <sv-button type="secondary" block :loading="demoLoading" @click="toggleDemo">
                  <sv-icon :name="demoPlaying ? 'stop.fill' : 'play.fill'" :size="16" />
                  <text>{{ demoPlaying ? '停止' : '听示范' }}</text>
                </sv-button>
              </view>
              <view class="english__action">
                <sv-button block haptic :disabled="generating || revising" @click="openRecite">
                  <sv-icon name="mic.fill" :size="16" color="var(--sv-text-on-accent)" />
                  <text>开始背诵</text>
                </sv-button>
              </view>
            </view>
            <text class="block__hint">点某一句可以单独重听，长按挑词收藏</text>
          </view>

          <view v-if="practices.length" class="block">
            <text class="block__label">背诵练习</text>
            <sv-card :padding="2" radius="m">
              <view
                v-for="(p, i) in practices"
                :key="p.id"
                class="practice"
                :class="{ 'has-divider': i > 0 }"
                hover-class="is-pressed"
                :hover-stay-time="60"
                @tap="openReport(p.id)"
              >
                <text class="practice__score" :class="`is-${practiceTone(p)}`">{{
                  p.overall ?? '—'
                }}</text>
                <view class="practice__info">
                  <text class="practice__title">{{ practiceTitle(p) }}</text>
                  <text class="practice__meta">{{ practiceMeta(p) }}</text>
                </view>
                <sv-icon name="chevron.right" :size="16" :weight="2.2" color="var(--sv-text-3)" />
              </view>
            </sv-card>
          </view>

          <view v-if="current.alternatives.length" class="block">
            <text class="block__label">其他说法</text>
            <sv-card :padding="2" radius="m">
              <view
                v-for="(alt, i) in current.alternatives"
                :key="i"
                class="alt"
                :class="{ 'has-divider': i > 0 }"
              >
                <text class="alt__label">{{ alt.label }}</text>
                <text class="alt__en sv-en">{{ alt.en }}</text>
              </view>
            </sv-card>
          </view>

          <view class="block">
            <text class="block__label">解析</text>
            <analysis-view
              v-if="current.analysis"
              :analysis="current.analysis"
              :saved-keys="savedKeys"
              @save="saveFromAnalysis"
            />
            <sv-card v-else-if="analyzeError" :padding="24" radius="m">
              <sv-state
                icon="alert"
                tone="danger"
                title="解析没有生成"
                :description="analyzeError.message"
              >
                <sv-button type="secondary" size="sm" @click="ensureAnalysis(true)">重试</sv-button>
              </sv-state>
            </sv-card>
            <sv-card v-else :padding="18" radius="m">
              <sv-skeleton :rows="3" title />
              <text class="block__hint">正在整理值得学习的表达…</text>
            </sv-card>
          </view>
        </template>
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <revise-bar
    v-if="current"
    v-model="reviseText"
    :disabled="busy"
    :hint="busyHint"
    @submit="revise"
  />

  <word-picker
    v-model:show="wordPick.show"
    :sentence="wordPick.sentence"
    :saved-keys="savedKeys"
    :saving="wordPick.saving"
    @save="saveFromSentence"
  />
  <folder-picker
    v-model:show="organizer.picker.show"
    :current="organizer.picker.current"
    @pick="organizer.onPick"
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
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { PracticeSummary, Session, Version } from '@shared/types'
import FolderPicker from '@/components/library/FolderPicker.vue'
import SavedToast from '@/components/library/SavedToast.vue'
import ProSheet from '@/components/pro/ProSheet.vue'
import { useDemoPlayer } from '@/composables/useDemoPlayer'
import { useOrganizer, type OrganizeTarget } from '@/composables/useOrganizer'
import { callCloud, CloudError } from '@/services/cloud'
import { starSession } from '@/services/library'
import { listPractices } from '@/services/practice'
import { getSession, runSessionJob, setCurrentVersion } from '@/services/sessions'
import { useAccountStore } from '@/stores/account'
import { useLibraryStore } from '@/stores/library'
import { useSessionsStore } from '@/stores/sessions'
import { useSystemStore } from '@/stores/system'
import { toast } from '@/utils/dialog'
import { navigateTo } from '@/utils/nav'
import { scoreTone } from '@/utils/recite'
import { formatRelative } from '@/utils/time'
import AnalysisView from '../components/AnalysisView.vue'
import ReviseBar from '../components/ReviseBar.vue'
import SentenceList from '../components/SentenceList.vue'
import WordPicker from '../components/WordPicker.vue'
import { LOCATE_HIGHLIGHT_MS, REVISE_BAR_HEIGHT } from '../constants'

const PROGRESS_HINTS = ['正在理解你的意思…', '正在组织地道的说法…', '快好了，再等一下…']

const sessionId = ref('')
const session = ref<Session | null>(null)
const loadError = ref<CloudError | null>(null)
const genError = ref<CloudError | null>(null)
const analyzeError = ref<CloudError | null>(null)
const generating = ref(false)
const analyzing = ref(false)
const revising = ref(false)
const pendingInstruction = ref('')
const reviseText = ref('')
const rawExpanded = ref(false)
const scrollTarget = ref('')
const progressIndex = ref(0)

const { metrics } = storeToRefs(useSystemStore())
const sessionsStore = useSessionsStore()
const accountStore = useAccountStore()
const { account } = storeToRefs(accountStore)
/** Explain Pro when free uses run out */
const showPro = ref(false)

const current = computed<Version | null>(() => {
  const s = session.value
  if (!s || s.versions.length === 0) return null
  return s.versions.find((v) => v.vid === s.currentVid) ?? s.versions[s.versions.length - 1] ?? null
})

const navTitle = computed(() => session.value?.title || '新的表达')

/**
 * No revisions while a job is running (including jobs started before the user last left that
 * haven't finished)
 */
const busy = computed(() => generating.value || revising.value || analyzing.value)
const busyHint = computed(() => {
  if (analyzing.value) return '解析生成中，稍后就可以修改'
  if (generating.value) return '正在生成，稍后就可以修改'
  return ''
})

/** After the page closes, stop all waiting and start no new jobs */
let disposed = false
onUnload(() => {
  disposed = true
})
const isCancelled = () => disposed
const progressHint = computed(() => PROGRESS_HINTS[progressIndex.value] ?? PROGRESS_HINTS[0]!)
const bottomInset = computed(() => {
  const bar = current.value ? REVISE_BAR_HEIGHT : 0
  return `height:${bar + metrics.value.safeAreaBottom + 24}px`
})

// Rotate hint text while generating, so the wait doesn't feel stuck
let progressTimer: ReturnType<typeof setInterval> | null = null
watch(generating, (on) => {
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = null
  progressIndex.value = 0
  if (on) {
    progressTimer = setInterval(() => {
      progressIndex.value = Math.min(progressIndex.value + 1, PROGRESS_HINTS.length - 1)
    }, 5_000)
  }
})
onUnmounted(() => {
  if (progressTimer) clearInterval(progressTimer)
})

function asCloudError(err: unknown): CloudError {
  return err instanceof CloudError ? err : new CloudError('INTERNAL', '出了点问题，请重试')
}

function versionLabel(v: Version, index: number): string {
  if (index === 0 || !v.instruction) return '原版'
  return v.instruction.length > 6 ? `${v.instruction.slice(0, 6)}…` : v.instruction
}

onLoad((query) => {
  sessionId.value = String(query?.id ?? '')
  // Arriving from a saved item: open that version and highlight the sentence
  if (query?.vid) {
    locateTarget = { vid: String(query.vid), sentence: Number(query.s ?? -1) }
  }
  void reload()
  if (!libraryStore.loaded) void libraryStore.refresh()
})

// Retry automatically when returning from "LLM config" (「大模型配置」);
// refresh practice records when returning from the recitation / report page
onShow(() => {
  if (genError.value?.code === 'NOT_CONFIGURED') void generate()
  if (session.value) void loadPractices()
})

onHide(() => {
  stopDemo()
})

// --- Demo reading -----------------------------------------------------------

const currentVid = computed(() => current.value?.vid ?? null)
const {
  playing: demoPlaying,
  loading: demoLoading,
  activeSentence,
  playAll,
  playSentence,
  stop: stopDemo,
} = useDemoPlayer(sessionId, currentVid)

function toggleDemo() {
  if (demoPlaying.value) stopDemo()
  else void playAll()
}

// --- Recitation practice ----------------------------------------------------

const practices = ref<PracticeSummary[]>([])

async function loadPractices() {
  try {
    practices.value = await listPractices(sessionId.value)
  } catch {
    // Practice records don't affect the session itself; stay quiet if loading fails
  }
}

function practiceTone(p: PracticeSummary) {
  return p.overall === null ? 'none' : scoreTone(p.overall)
}

function practiceTitle(p: PracticeSummary) {
  const index = session.value?.versions.findIndex((v) => v.vid === p.vid) ?? -1
  const v = session.value?.versions[index]
  return v ? `背诵「${versionLabel(v, index)}」` : '背诵'
}

function practiceMeta(p: PracticeSummary) {
  const status =
    p.stage === 'done'
      ? ''
      : !p.scoreRequested
        ? ' · 未评分'
        : p.failed
          ? ' · 评分失败'
          : ' · 评分中'
  return `${formatRelative(p.createdAt)}${status}`
}

function openRecite() {
  if (!current.value) return
  stopDemo()
  navigateTo(
    `/pkg-recite/recite/index?sessionId=${encodeURIComponent(sessionId.value)}&vid=${current.value.vid}`,
  )
}

function openReport(practiceId: string) {
  stopDemo()
  navigateTo(`/pkg-recite/report/index?practiceId=${encodeURIComponent(practiceId)}`)
}

async function reload() {
  loadError.value = null
  try {
    session.value = await getSession(sessionId.value)
  } catch (err) {
    loadError.value = asCloudError(err)
    return
  }
  await applyLocate()
  void loadPractices()
  await ensure()
}

// --- Save -------------------------------------------------------------------

const libraryStore = useLibraryStore()
const { keys: savedKeys } = storeToRefs(libraryStore)
const organizer = useOrganizer()
const located = ref(-1)
let locateTarget: { vid: string; sentence: number } | null = null
let locateTimer: ReturnType<typeof setTimeout> | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => {
  if (locateTimer) clearTimeout(locateTimer)
  if (scrollTimer) clearTimeout(scrollTimer)
})

/**
 * Switch to that version, scroll to the English and highlight the sentence.
 * Save it as the current version, as tapping a version tab does; otherwise later job results (the
 * cloud is the source of truth) would switch the page back to the old version.
 */
async function applyLocate() {
  const s = session.value
  const target = locateTarget
  locateTarget = null
  if (!s || !target || !s.versions.some((v) => v.vid === target.vid)) return
  session.value = { ...s, currentVid: target.vid }
  if (s.currentVid !== target.vid) {
    try {
      await setCurrentVersion(sessionId.value, target.vid)
    } catch {
      // A failed save only affects next time's default version; still locate as usual this time
    }
  }
  located.value = target.sentence
  scrollTarget.value = ''
  scrollTimer = setTimeout(() => {
    scrollTarget.value = 'english'
  }, 50)
  // A bit longer than SentenceList's highlight animation; clear it after the animation ends
  locateTimer = setTimeout(() => {
    located.value = -1
  }, LOCATE_HIGHLIGHT_MS + 200)
}

/** Keep the save toast clear of the revise bar at the bottom */
const toastBottom = computed(() => REVISE_BAR_HEIGHT + metrics.value.safeAreaBottom + 12)

/** A save request is in flight: repeated taps send it only once */
let starring = false
const savingPhrases = new Set<string>()

async function toggleStar() {
  const s = session.value
  if (!s || starring) return
  starring = true
  const star = !s.starredAt
  try {
    const fields = await starSession(s.id, star)
    if (session.value) session.value = { ...session.value, ...fields }
    libraryStore.touch()
    void sessionsStore.refresh()
    if (star) {
      organizer.notifySaved({
        tab: 'session',
        id: s.id,
        folderId: fields.folderId,
        tags: fields.tags,
      })
    } else {
      toast('已取消收藏')
    }
  } catch (err) {
    toast(asCloudError(err).message)
  } finally {
    starring = false
  }
}

function expressionTarget(id: string, folderId: string | null, tags: string[]): OrganizeTarget {
  return { tab: 'expression', id, folderId, tags }
}

function openExpression(id: string) {
  stopDemo()
  navigateTo(`/pkg-library/expression/index?id=${encodeURIComponent(id)}`)
}

async function saveFromAnalysis(kind: 'phrase' | 'slang', index: number) {
  const version = current.value
  const item =
    kind === 'phrase' ? version?.analysis?.keyPhrases[index] : version?.analysis?.slang[index]
  if (!version || !item) return
  // Already saved: open the card directly
  const existing = libraryStore.savedId(item.phrase)
  if (existing) return openExpression(existing)
  if (savingPhrases.has(item.phrase)) return
  savingPhrases.add(item.phrase)
  try {
    const { expression } = await libraryStore.save({
      text: item.phrase,
      kind,
      meaning: item.meaning,
      ...('usage' in item ? { usage: item.usage, example: item.example } : {}),
      source: { sessionId: sessionId.value, vid: version.vid, sentenceIndex: -1, from: 'analysis' },
    })
    organizer.notifySaved(expressionTarget(expression.id, expression.folderId, expression.tags))
  } catch (err) {
    toast(asCloudError(err).message)
  } finally {
    savingPhrases.delete(item.phrase)
  }
}

const wordPick = reactive({ show: false, sentence: '', index: -1, saving: false })

function openWordPicker(index: number) {
  const sentence = current.value?.sentences[index]
  if (!sentence) return
  stopDemo()
  wordPick.sentence = sentence.en
  wordPick.index = index
  wordPick.show = true
}

async function saveFromSentence(text: string) {
  const version = current.value
  if (!version || wordPick.saving) return
  wordPick.saving = true
  try {
    const { expression, created } = await libraryStore.save({
      text,
      kind: 'word',
      source: {
        sessionId: sessionId.value,
        vid: version.vid,
        sentenceIndex: wordPick.index,
        from: 'sentence',
      },
    })
    wordPick.show = false
    organizer.notifySaved(
      expressionTarget(expression.id, expression.folderId, expression.tags),
      created ? '已收藏' : '已收藏，记下了新来源',
    )
  } catch (err) {
    toast(asCloudError(err).message)
  } finally {
    wordPick.saving = false
  }
}

/**
 * Fill in missing content when the page opens: wait for running jobs first, then generate the first
 * version, then the analysis
 */
async function ensure() {
  const s = session.value
  if (!s) return
  if (s.job) {
    const watching = s.job.kind === 'analyze' ? analyzing : generating
    watching.value = true
    try {
      session.value = await runSessionJob(sessionId.value, async () => ({ session: s }), {
        isDone: (next) => next.job === null,
        isCancelled,
      })
    } catch {
      // If waiting fails, continue with the current data; the needed jobs are restarted below
    } finally {
      watching.value = false
    }
  }
  if (disposed) return
  if (session.value && session.value.versions.length === 0) await generate()
  await ensureAnalysis()
}

async function generate() {
  if (generating.value || disposed) return
  generating.value = true
  genError.value = null
  try {
    session.value = await runSessionJob(
      sessionId.value,
      () => callCloud('compose', 'generate', { sessionId: sessionId.value }),
      { isDone: (s) => s.versions.length > 0, isCancelled },
    )
    void sessionsStore.refresh()
  } catch (err) {
    if (disposed) return
    genError.value = asCloudError(err)
    if (genError.value.code === 'QUOTA_EXCEEDED') showPro.value = true
    return
  } finally {
    generating.value = false
    // The first version used one free use (refunded on failure); refresh the remaining count
    accountStore.refresh()
  }
  await ensureAnalysis()
}

async function ensureAnalysis(retry = false) {
  const version = current.value
  if (!version || version.analysis || analyzing.value || disposed) return
  if (analyzeError.value && !retry) return
  const vid = version.vid
  analyzing.value = true
  analyzeError.value = null
  try {
    session.value = await runSessionJob(
      sessionId.value,
      () => callCloud('compose', 'analyze', { sessionId: sessionId.value, vid }),
      {
        isDone: (s) => Boolean(s.versions.find((v) => v.vid === vid)?.analysis),
        isCancelled,
      },
    )
  } catch (err) {
    if (!disposed) analyzeError.value = asCloudError(err)
    return
  } finally {
    analyzing.value = false
  }
  // The version may have changed during analysis; fill in the analysis for the new version
  if (current.value && !current.value.analysis) await ensureAnalysis()
}

async function revise(instruction: string) {
  const s = session.value
  const base = current.value
  if (!s || !base || busy.value) return
  const before = s.versions.length
  stopDemo()
  revising.value = true
  pendingInstruction.value = instruction
  scrollTarget.value = ''
  try {
    session.value = await runSessionJob(
      sessionId.value,
      () =>
        callCloud('compose', 'revise', {
          sessionId: sessionId.value,
          baseVid: base.vid,
          instruction,
        }),
      { isDone: (next) => next.versions.length > before, isCancelled },
    )
    reviseText.value = ''
    analyzeError.value = null
    scrollTarget.value = 'english'
    void sessionsStore.refresh()
  } catch (err) {
    if (disposed) return
    const e = asCloudError(err)
    if (e.code === 'NOT_CONFIGURED' && account.value?.isAdmin) {
      uni.showModal({
        title: '还不能修改',
        content: e.message,
        confirmText: '去配置',
        success: (res) => res.confirm && openLlmSettings(),
      })
    } else {
      uni.showToast({ title: e.message, icon: 'none' })
    }
    return
  } finally {
    revising.value = false
  }
  await ensureAnalysis()
}

async function selectVersion(vid: string) {
  const s = session.value
  if (!s || s.currentVid === vid || revising.value) return
  const previous = s.currentVid
  session.value = { ...s, currentVid: vid }
  analyzeError.value = null
  try {
    await setCurrentVersion(sessionId.value, vid)
  } catch (err) {
    if (session.value) session.value = { ...session.value, currentVid: previous }
    uni.showToast({ title: asCloudError(err).message, icon: 'none' })
    return
  }
  await ensureAnalysis()
}

function copyEnglish() {
  if (current.value) uni.setClipboardData({ data: current.value.en })
}

function openLlmSettings() {
  navigateTo('/pkg-settings/llm/index')
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.session {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 16px 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.block__label {
  padding: 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--sv-text-2);

  &.is-live {
    color: var(--sv-accent);
  }
}

.block__hint {
  display: block;
  margin-top: 14px;
  font-size: 14px;
  color: var(--sv-text-2);
}

.raw {
  font-size: 15px;
  line-height: 22px;
  color: var(--sv-text-2);

  &.is-clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
  }
}

.polished {
  font-size: 16px;
  line-height: 25px;
}

.star {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  transition: opacity var(--sv-dur-1) var(--sv-ease);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.5;
  }
}

.copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  font-size: 14px;
  color: var(--sv-accent);
  transition: opacity var(--sv-dur-1) var(--sv-ease);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.5;
  }
}

.versions {
  white-space: nowrap;
}

.versions__inner {
  display: inline-flex;
  gap: 8px;
  padding: 0 2px 2px;
}

.english {
  position: relative;
  transition: opacity var(--sv-dur-2) var(--sv-ease);

  &.is-busy {
    opacity: 0.55;
  }
}

.english__busy {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -28px;
  text-align: center;
  font-size: 13px;
  color: var(--sv-accent);
}

.english__actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.english__action {
  flex: 1;
}

.practice {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.practice__score {
  width: 44px;
  font-size: 24px;
  line-height: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--sv-text-3);

  &.is-good {
    color: var(--sv-success);
  }

  &.is-fair {
    color: var(--sv-warning);
  }

  &.is-poor {
    color: var(--sv-danger);
  }
}

.practice__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.practice__title {
  font-size: 16px;
  line-height: 21px;
}

.practice__meta {
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-text-2);
}

.alt {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 0.5px;
    background-color: var(--sv-separator);
  }
}

.alt__label {
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);
}

.alt__en {
  font-size: 16px;
  line-height: 23px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.session__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  @include sv-appear;
}
</style>
