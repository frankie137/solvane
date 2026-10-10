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
          <sv-button size="sm" @click="goHome">去练习</sv-button>
        </view>
      </sv-state>
    </view>

    <view v-else-if="!share" class="stage__state">
      <text class="stage__loading">加载中…</text>
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
          :class="{ 'is-current': i === current, 'is-silent': s.startMs < 0 }"
          @tap="jumpTo(i)"
        >
          <view v-if="i === current && s.words.length" class="line__en sv-en">
            <text
              v-for="(t, j) in tokensOf(i)"
              :key="j"
              class="line__word"
              :class="{ 'is-lit': j <= litToken }"
              >{{ t.text + ' ' }}</text
            >
          </view>
          <text v-else class="line__en sv-en">{{ s.en }}</text>
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

    <!-- 生成分享封面用，放在屏幕外 -->
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

/** 手动滚动后多久恢复自动跟随 */
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
onUnload(() => player.destroy())

async function load() {
  error.value = null
  try {
    const s = await getShare(shareId.value)
    share.value = s
    player.load(s.audioUrl, s.durationMs)
    await nextTick()
    // 等列表渲染完再量每一行的位置
    setTimeout(() => {
      measure()
      void makeCover(s)
    }, 80)
  } catch (err) {
    error.value = err instanceof CloudError ? err : new CloudError('INTERNAL', '加载失败，请重试')
  }
}

// --- 当前句与逐词点亮 -------------------------------------------------------

const current = computed(() =>
  share.value ? currentLine(share.value.sentences, player.positionMs.value) : -1,
)
const tokens = computed(() => share.value?.sentences.map((s) => tokenize(s.en)) ?? [])
const tokensOf = (i: number) => tokens.value[i] ?? []
/** 当前句里读到的词（及之前的词）点亮；只在变化时更新 */
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

// --- 居中滚动 ---------------------------------------------------------------

const viewport = ref(0)
let tops: number[] = []
let heights: number[] = []
const scrollTop = ref(0)
let manualUntil = 0
let followTimer: ReturnType<typeof setTimeout> | null = null

/** 上下留半屏空白，第一句和最后一句也能滚到中间 */
const padStyle = computed(() => `height:${Math.max(0, Math.round(viewport.value / 2 - 40))}px`)

function measure() {
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select('.lyrics').boundingClientRect()
  query.select('.lyrics').scrollOffset(() => {})
  query.selectAll('.line').boundingClientRect()
  query.exec((res) => {
    const box = res[0] as UniApp.NodeInfo | null
    const offset = res[1] as UniApp.NodeInfo | null
    const lines = (res[2] as UniApp.NodeInfo[] | null) ?? []
    if (!box) return
    viewport.value = box.height ?? 0
    const base = (box.top ?? 0) - (offset?.scrollTop ?? 0)
    tops = lines.map((r) => (r.top ?? 0) - base)
    heights = lines.map((r) => r.height ?? 0)
    follow(true)
  })
}

/** 把当前句滚到中间；用户刚手动滚过时不动 */
function follow(force = false) {
  const i = Math.max(0, current.value)
  if (!force && Date.now() < manualUntil) return
  const top = tops[i]
  if (top === undefined) return
  const target = centerScrollTop(top, heights[i] ?? 0, viewport.value)
  // scroll-top 值不变时不会滚动（用户手动滚开后再回来），加一点点差值强制生效
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

// --- 进度条 -----------------------------------------------------------------

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

function onBarStart(e: TouchEvent) {
  dragging.value = true
  uni
    .createSelectorQuery()
    .in(instance?.proxy)
    .select('#bar')
    .boundingClientRect((rect) => {
      const r = rect as UniApp.NodeInfo | null
      barRect = r ? { left: r.left ?? 0, width: r.width ?? 0 } : null
      dragMs.value = msAt(e)
    })
    .exec()
}

function onBarMove(e: TouchEvent) {
  if (dragging.value && barRect) dragMs.value = msAt(e)
}

function onBarEnd(e: TouchEvent) {
  if (!dragging.value) return
  if (barRect) dragMs.value = msAt(e)
  dragging.value = false
  manualUntil = 0
  player.seek(dragMs.value)
}

// --- 分享 -------------------------------------------------------------------

/** 用隐藏画布画封面，作为分享卡片的图片；画不出来时用微信默认截图 */
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
        // 封面只是锦上添花
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

.stage__loading {
  font-size: 15px;
  color: var(--sv-text-2);
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
  // 上下边缘渐隐
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
  padding: 8px 28px 0;
}

.bar {
  position: relative;
  height: 28px;
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
  box-shadow: 0 8px 24px var(--sv-accent-glow);
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
