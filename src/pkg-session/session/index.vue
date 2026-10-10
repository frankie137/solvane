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
    <sv-nav-bar :title="navTitle" back :large="false" />

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

      <template v-else>
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

        <!-- 还没有任何版本：生成中或失败 -->
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
                  v-if="genError.code === 'NOT_CONFIGURED'"
                  size="sm"
                  @click="openLlmSettings"
                >
                  去配置
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
                <sentence-list :sentences="current.sentences" />
              </sv-card>
              <view v-if="revising" class="english__busy">
                <text>正在按「{{ pendingInstruction }}」修改…</text>
              </view>
            </view>
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
            <analysis-view v-if="current.analysis" :analysis="current.analysis" />
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
      </template>
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
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { Session, Version } from '@shared/types'
import { callCloud, CloudError } from '@/services/cloud'
import { getSession, runSessionJob, setCurrentVersion } from '@/services/sessions'
import { useSessionsStore } from '@/stores/sessions'
import { useSystemStore } from '@/stores/system'
import AnalysisView from '../components/AnalysisView.vue'
import ReviseBar from '../components/ReviseBar.vue'
import SentenceList from '../components/SentenceList.vue'
import { REVISE_BAR_HEIGHT } from '../constants'

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

const current = computed<Version | null>(() => {
  const s = session.value
  if (!s || s.versions.length === 0) return null
  return s.versions.find((v) => v.vid === s.currentVid) ?? s.versions[s.versions.length - 1] ?? null
})

const navTitle = computed(() => session.value?.title || '新的表达')

/** 有任务在运行（包括上次离开前发起、还没结束的任务）时不能再提修改 */
const busy = computed(() => generating.value || revising.value || analyzing.value)
const busyHint = computed(() => {
  if (analyzing.value) return '解析生成中，稍后就可以修改'
  if (generating.value) return '正在生成，稍后就可以修改'
  return ''
})

/** 页面关闭后停止所有等待，不再发起新的任务 */
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

// 生成时轮换提示文案，让等待不显得卡住
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
  void reload()
})

// 从"大模型配置"回来时自动重试
onShow(() => {
  if (genError.value?.code === 'NOT_CONFIGURED') void generate()
})

async function reload() {
  loadError.value = null
  try {
    session.value = await getSession(sessionId.value)
  } catch (err) {
    loadError.value = asCloudError(err)
    return
  }
  await ensure()
}

/** 打开页面时补齐缺的内容：先等正在运行的任务，再生成第一版，最后生成解析 */
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
      // 等待失败时按当前数据继续，下面会重新发起需要的任务
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
    if (!disposed) genError.value = asCloudError(err)
    return
  } finally {
    generating.value = false
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
  // 解析期间可能切换了版本，补上新版本的解析
  if (current.value && !current.value.analysis) await ensureAnalysis()
}

async function revise(instruction: string) {
  const s = session.value
  const base = current.value
  if (!s || !base || busy.value) return
  const before = s.versions.length
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
    if (e.code === 'NOT_CONFIGURED') {
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
  uni.navigateTo({ url: '/pkg-settings/llm/index' })
}
</script>

<style lang="scss">
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

.copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  font-size: 14px;
  color: var(--sv-accent);
  transition: opacity var(--sv-dur-1) var(--sv-ease);

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
</style>
