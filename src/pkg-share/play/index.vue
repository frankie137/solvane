<template>
  <view class="sv-stage stage">
    <view class="stage__bg" />
    <view class="stage__glow" />

    <sv-nav-bar title="" back :large="false" />

    <view v-if="error" class="stage__state">
      <sv-state icon="alert" :title="errorTitle" :description="error.message">
        <view class="stage__state-actions">
          <sv-button v-if="error.code !== 'NOT_FOUND'" type="secondary" size="sm" @click="load">
            重试
          </sv-button>
          <sv-button size="sm" @click="goHome">我也来练</sv-button>
        </view>
      </sv-state>
    </view>

    <!-- Loading: placeholder rows laid out like the lyrics -->
    <view v-else-if="!share" class="stage__skeleton">
      <view class="ghost is-title" />
      <view class="ghost is-author" />
      <view v-for="i in 5" :key="i" class="ghost-line" :class="{ 'is-current': i === 2 }">
        <view class="ghost is-en" />
        <view class="ghost is-zh" />
      </view>
    </view>

    <view v-else class="stage__main">
      <view class="head">
        <text class="head__title">{{ share.title }}</text>
        <view class="head__author">
          <image
            v-if="share.author.avatarUrl"
            class="head__avatar"
            :src="share.author.avatarUrl"
            mode="aspectFill"
          />
          <view v-else class="head__avatar is-empty">
            <sv-icon name="person.fill" :size="12" color="var(--sv-text-on-accent)" />
          </view>
          <text class="head__name">{{ share.author.nickname }} 的朗读</text>
        </view>
      </view>

      <scroll-view
        class="lyrics"
        scroll-y
        :enhanced="true"
        :show-scrollbar="false"
        :scroll-top="scrollTop"
        :scroll-with-animation="true"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view :style="padStyle" />
        <view
          v-for="(s, i) in share.sentences"
          :key="i"
          class="line"
          hover-class="is-pressed"
          :hover-stay-time="60"
          :class="{ 'is-current': i === current, 'is-silent': s.startMs < 0 }"
          @tap="jumpTo(i)"
        >
          <!-- Render every sentence word by word, so the layout doesn't change when the current
               sentence switches and measured line positions stay valid -->
          <view class="line__en sv-en">
            <text
              v-for="(t, j) in tokensOf(i)"
              :key="j"
              class="line__word"
              :class="{ 'is-lit': i === current && (s.words.length === 0 || j <= litToken) }"
              >{{ t.text + ' ' }}</text
            >
          </view>
          <text class="line__zh">{{ s.zh }}</text>
        </view>
        <view :style="padStyle" />
      </scroll-view>

      <view class="controls" :style="controlsStyle">
        <view
          id="bar"
          class="bar"
          @touchstart="onBarStart"
          @touchmove.stop.prevent="onBarMove"
          @touchend="onBarEnd"
          @touchcancel="onBarEnd"
        >
          <view class="bar__track">
            <view class="bar__fill" :style="`width:${progress}%`" />
          </view>
          <view
            class="bar__thumb"
            :class="{ 'is-dragging': dragging }"
            :style="`left:${progress}%`"
          />
        </view>
        <view v-if="player.failed.value" class="audio-error">
          <text>录音没能加载</text>
          <view class="audio-error__retry" hover-class="is-pressed" @tap="load">
            <text>重试</text>
          </view>
        </view>
        <view class="times">
          <text>{{ formatClock(shownMs) }}</text>
          <text>{{ formatClock(player.durationMs.value) }}</text>
        </view>

        <view class="actions">
          <view class="actions__side" />
          <view class="play" hover-class="is-pressed" @tap="player.toggle">
            <sv-icon
              :name="player.playing.value ? 'pause.fill' : 'play.fill'"
              :size="28"
              color="var(--sv-text-on-accent)"
            />
          </view>
          <view class="actions__side" />
        </view>

        <view v-if="share.mine" class="footer">
          <sv-button block open-type="share" haptic>
            <sv-icon name="share" :size="16" color="var(--sv-text-on-accent)" />
            <text>发给朋友</text>
          </sv-button>
          <text class="footer__note">好友需要是小程序的体验成员才能打开</text>
        </view>
        <view v-else class="footer">
          <sv-button type="secondary" block @click="goHome">我也来练</sv-button>
        </view>
      </view>
    </view>

    <!-- For drawing the share cover; kept off screen -->
    <canvas id="cover" type="2d" class="cover-canvas" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { Share } from '@shared/types'
import { useTrackPlayer } from '@/composables/useTrackPlayer'
import { CloudError } from '@/services/cloud'
import { getShare, sharePath } from '@/services/share'
import { useSystemStore } from '@/stores/system'
import { drawCover } from '@/utils/cover'
import { centerScrollTop, currentLine, formatClock } from '@/utils/lyrics'
import { activeTokenIndex, tokenize } from '@/utils/recite'

/** How long after a manual scroll before auto-follow resumes */
const MANUAL_SCROLL_MS = 3_000

const { metrics } = storeToRefs(useSystemStore())
const instance = getCurrentInstance()
const player = useTrackPlayer()

const shareId = ref('')
const share = ref<Share | null>(null)
const error = ref<CloudError | null>(null)
const coverPath = ref('')

const errorTitle = computed(() =>
  error.value?.code === 'NOT_FOUND' ? '分享已撤回' : '没能打开这个分享',
)
const controlsStyle = computed(() => `padding-bottom:${metrics.value.safeAreaBottom + 16}px`)

onLoad((query) => {
  shareId.value = String(query?.shareId ?? '')
  void load()
})

onHide(() => player.pause())
onUnload(() => {
  player.destroy()
  if (followTimer) clearTimeout(followTimer)
  if (measureTimer) clearTimeout(measureTimer)
})

let measureTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  error.value = null
  // Reload after the recording failed to load: get a new temporary URL, resume where it was
  const resumeAt = share.value ? player.positionMs.value : 0
  const wasPlaying = player.playing.value
  try {
    const s = await getShare(shareId.value)
    share.value = s
    player.load(s.audioUrl, s.durationMs)
    // Only restore the position; resume playback only if it was playing
    if (resumeAt > 0) player.seek(resumeAt, wasPlaying)
    await nextTick()
    // Wait for the list to render before measuring each line's position
    if (measureTimer) clearTimeout(measureTimer)
    measureTimer = setTimeout(() => {
      measure()
      void makeCover(s)
    }, 80)
  } catch (err) {
    error.value = err instanceof CloudError ? err : new CloudError('INTERNAL', '出了点问题，请重试')
  }
}

// --- Current sentence and word-by-word highlight ----------------------------

const current = computed(() =>
  share.value ? currentLine(share.value.sentences, player.positionMs.value) : -1,
)
const tokens = computed(() => share.value?.sentences.map((s) => tokenize(s.en)) ?? [])
const tokensOf = (i: number) => tokens.value[i] ?? []
/** Light up the current sentence's spoken word and those before it; update only on change */
const litToken = ref(-1)
watch(
  () => player.positionMs.value,
  (ms) => {
    const i = current.value
    const s = share.value?.sentences[i]
    const next = s && s.words.length ? activeTokenIndex(tokensOf(i), s.words, ms) : -1
    if (next !== litToken.value) litToken.value = next
  },
)

// --- Keep the current line centered -----------------------------------------

const viewport = ref(0)
let tops: number[] = []
let heights: number[] = []
const scrollTop = ref(0)
let manualUntil = 0
let followTimer: ReturnType<typeof setTimeout> | null = null

/** Pad half a screen above and below so the first and last sentences can scroll to the center */
const padStyle = computed(() => `height:${Math.max(0, Math.round(viewport.value / 2 - 40))}px`)

/**
 * Measure the lyrics area height first to set the top and bottom padding; measure each line's
 * position only after the padding renders, otherwise the positions are from before the padding and
 * off by half a screen. The progress bar position is also measured here for later use.
 */
function measure() {
  uni
    .createSelectorQuery()
    .in(instance?.proxy)
    .select('.lyrics')
    .boundingClientRect((rect) => {
      const box = rect as UniApp.NodeInfo | null
      if (!box?.height) return
      viewport.value = box.height
      void nextTick(() => setTimeout(measureLines, 50))
    })
    .exec()
  void measureBar()
}

function measureLines() {
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select('.lyrics').boundingClientRect()
  query.select('.lyrics').scrollOffset(() => {})
  query.selectAll('.line').boundingClientRect()
  query.exec((res) => {
    const box = res[0] as UniApp.NodeInfo | null
    const offset = res[1] as UniApp.NodeInfo | null
    const lines = (res[2] as UniApp.NodeInfo[] | null) ?? []
    if (!box) return
    const base = (box.top ?? 0) - (offset?.scrollTop ?? 0)
    tops = lines.map((r) => (r.top ?? 0) - base)
    heights = lines.map((r) => r.height ?? 0)
    follow(true)
  })
}

/** Scroll the current sentence to the center; don't move if the user just scrolled manually */
function follow(force = false) {
  const i = Math.max(0, current.value)
  if (!force && Date.now() < manualUntil) return
  const top = tops[i]
  if (top === undefined) return
  const target = centerScrollTop(top, heights[i] ?? 0, viewport.value)
  // scroll-top doesn't scroll if the value is unchanged (the user scrolled away and back), so add a
  // tiny offset to force it
  scrollTop.value = target === scrollTop.value ? target + 0.01 : target
}

watch(current, () => follow())

function onTouchStart() {
  manualUntil = Number.POSITIVE_INFINITY
  if (followTimer) clearTimeout(followTimer)
}

function onTouchEnd() {
  manualUntil = Date.now() + MANUAL_SCROLL_MS
  if (followTimer) clearTimeout(followTimer)
  followTimer = setTimeout(() => follow(), MANUAL_SCROLL_MS + 50)
}

function jumpTo(i: number) {
  const s = share.value?.sentences[i]
  if (!s || s.startMs < 0) return
  manualUntil = 0
  player.seek(s.startMs)
}

// --- Progress bar -----------------------------------------------------------

const dragging = ref(false)
const dragMs = ref(0)
let barRect: { left: number; width: number } | null = null

const shownMs = computed(() => (dragging.value ? dragMs.value : player.positionMs.value))
const progress = computed(() => {
  const total = player.durationMs.value
  return total > 0 ? Math.min(100, (shownMs.value / total) * 100) : 0
})

type TouchEvent = { touches?: { clientX: number }[]; changedTouches?: { clientX: number }[] }

function msAt(e: TouchEvent): number {
  const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0
  if (!barRect || barRect.width <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (x - barRect.left) / barRect.width))
  return Math.round(ratio * player.durationMs.value)
}

function measureBar(): Promise<void> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(instance?.proxy)
      .select('#bar')
      .boundingClientRect((rect) => {
        const r = rect as UniApp.NodeInfo | null
        if (r?.width) barRect = { left: r.left ?? 0, width: r.width }
        resolve()
      })
      .exec()
  })
}

/**
 * If the progress bar hasn't been measured on press, compute once it is; if released before that,
 * seek once it is measured
 */
let barReady: Promise<void> | null = null

function onBarStart(e: TouchEvent) {
  dragging.value = true
  if (barRect) {
    dragMs.value = msAt(e)
    barReady = null
  } else {
    barReady = measureBar().then(() => {
      dragMs.value = msAt(e)
    })
  }
}

function onBarMove(e: TouchEvent) {
  if (dragging.value && barRect) dragMs.value = msAt(e)
}

async function onBarEnd(e: TouchEvent) {
  if (!dragging.value) return
  if (barReady) await barReady
  if (barRect) dragMs.value = msAt(e)
  dragging.value = false
  manualUntil = 0
  player.seek(dragMs.value)
}

// --- Share ------------------------------------------------------------------

/**
 * Draw the cover on a hidden canvas as the share card image; fall back to WeChat's default
 * screenshot if drawing fails
 */
async function makeCover(s: Share) {
  const first = s.sentences.find((x) => x.en)?.en ?? s.title
  uni
    .createSelectorQuery()
    .in(instance?.proxy)
    .select('#cover')
    .fields({ node: true, size: true }, () => {})
    .exec((res) => {
      const node = (res[0] as { node?: unknown } | null)?.node as
        Parameters<typeof drawCover>[0] | undefined
      if (!node) return
      try {
        drawCover(node, { title: s.title, line: first, author: s.author.nickname })
        wx.canvasToTempFilePath({
          canvas: node as unknown as WechatMiniprogram.Canvas,
          success: (r) => {
            coverPath.value = r.tempFilePath
          },
          fail: () => {},
        })
      } catch {
        // The cover is only a nice-to-have
      }
    })
}

onShareAppMessage(() => {
  const s = share.value
  if (!s) return { title: 'Solvane', path: '/pages/index/index' }
  return {
    title: `${s.author.nickname}的英文朗读｜${s.title}`,
    path: sharePath(s.id),
    ...(coverPath.value ? { imageUrl: coverPath.value } : {}),
  }
})

function goHome() {
  player.pause()
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  color: var(--sv-text);
  background-color: var(--sv-bg);
}

.stage__bg,
.stage__glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.stage__bg {
  background: var(--sv-stage-bg);
}

.stage__glow {
  background: var(--sv-stage-glow);
}

.stage__state {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 32px;
}

.stage__state-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.stage__skeleton {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 32px;
}

.ghost {
  border-radius: 6px;
  background-color: var(--sv-fill);

  &.is-title {
    width: 50%;
    height: 22px;
  }

  &.is-author {
    width: 30%;
    height: 14px;
    margin-bottom: 40px;
  }

  &.is-en {
    width: 100%;
    height: 22px;
  }

  &.is-zh {
    width: 60%;
    height: 14px;
  }
}

.ghost-line {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  opacity: 0.5;

  &.is-current {
    opacity: 1;
  }
}

.stage__main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 32px 8px;
}

.head__title {
  font-size: 20px;
  line-height: 26px;
  font-weight: 700;
  text-align: center;
}

.head__author {
  display: flex;
  align-items: center;
  gap: 6px;
}

.head__avatar {
  width: 20px;
  height: 20px;
  border-radius: 10px;

  &.is-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--sv-accent-gradient);
  }
}

.head__name {
  font-size: 13px;
  color: var(--sv-text-2);
}

.lyrics {
  flex: 1;
  min-height: 0;
  // Fade out the top and bottom edges
  -webkit-mask-image: linear-gradient(transparent 0%, #000 14%, #000 86%, transparent 100%);
  mask-image: linear-gradient(transparent 0%, #000 14%, #000 86%, transparent 100%);
}

.line {
  padding: 12px 32px;
  color: var(--sv-stage-line);
  transform-origin: left center;
  transition:
    color var(--sv-dur-2) var(--sv-ease),
    transform var(--sv-dur-3) var(--sv-ease),
    opacity var(--sv-dur-2) var(--sv-ease);

  &.is-current {
    color: var(--sv-stage-line-active);
    transform: scale(1.04);
  }

  &.is-silent {
    opacity: 0.5;
  }

  &.is-pressed:not(.is-silent) {
    background-color: var(--sv-fill);
  }
}

.line__en {
  display: block;
  font-size: 22px;
  line-height: 30px;
  font-weight: 700;
}

.line__word {
  color: var(--sv-stage-line);
  transition: color var(--sv-dur-1) var(--sv-ease);

  &.is-lit {
    color: var(--sv-stage-line-active);
  }
}

.line__zh {
  display: block;
  margin-top: 4px;
  font-size: 15px;
  line-height: 21px;
}

.controls {
  position: relative;
  padding: 0 28px;
}

.bar {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
}

.bar__track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background-color: var(--sv-stage-track);
}

.bar__fill {
  height: 100%;
  background-color: var(--sv-stage-line-active);
}

.bar__thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 6px;
  background-color: var(--sv-stage-line-active);
  transition: transform var(--sv-dur-1) var(--sv-ease);

  &.is-dragging {
    transform: scale(1.5);
  }
}

// Floats above the progress bar, so it doesn't push the controls below down when it appears
.audio-error {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--sv-text-2);
  @include sv-appear(audio-error-in);
}

.audio-error__retry {
  padding: 4px 10px;
  border-radius: 12px;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);
  @include sv-hit-area;

  &.is-pressed {
    opacity: 0.6;
  }
}

.times {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--sv-text-2);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0 16px;
}

.actions__side {
  flex: 1;
}

.play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 32px;
  background: var(--sv-accent-gradient);
  box-shadow: var(--sv-shadow-glow);
  transition: transform var(--sv-dur-1) var(--sv-ease);

  &.is-pressed {
    transform: scale(0.94);
  }
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer__note {
  text-align: center;
  font-size: 12px;
  color: var(--sv-text-3);
}

.cover-canvas {
  position: fixed;
  top: 0;
  left: -9999px;
  width: 500px;
  height: 400px;
}
</style>
