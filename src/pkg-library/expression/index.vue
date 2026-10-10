<template>
  <scroll-view
    class="page-scroll"
    scroll-y
    :enhanced="true"
    :bounces="true"
    :show-scrollbar="false"
  >
    <sv-nav-bar title="表达" back :large="false" />

    <view class="card-page">
      <sv-card v-if="loadError" :padding="24">
        <sv-state icon="alert" tone="danger" title="加载失败" :description="loadError">
          <sv-button type="secondary" size="sm" @click="load">重试</sv-button>
        </sv-state>
      </sv-card>

      <view v-else-if="!expression" class="block">
        <sv-card :padding="18" radius="m"><sv-skeleton :rows="3" title /></sv-card>
      </view>

      <template v-else>
        <sv-card :padding="20">
          <view class="hero">
            <view class="hero__row">
              <text class="hero__text sv-en">{{ expression.text }}</text>
              <view v-if="speakable" class="hero__speak" hover-class="is-pressed" @tap="speak">
                <sv-icon name="speaker" :size="18" color="var(--sv-accent)" />
              </view>
            </view>
            <text class="hero__kind">{{ KIND_TEXT[expression.kind] }}</text>

            <view v-if="expression.fill === 'ready'" class="hero__body">
              <text class="hero__meaning">{{ expression.meaning }}</text>
              <text v-if="expression.usage" class="hero__usage">{{ expression.usage }}</text>
              <view v-if="expression.example" class="hero__example">
                <sv-icon name="quote" :size="14" color="var(--sv-text-3)" />
                <text class="sv-en">{{ expression.example }}</text>
              </view>
            </view>
            <view v-else-if="expression.fill === 'pending'" class="hero__body">
              <sv-skeleton :rows="2" />
              <text class="hero__hint">正在按原句生成释义…</text>
            </view>
            <view v-else class="hero__body">
              <text class="hero__hint is-error">{{ fillError || '释义没有生成' }}</text>
              <view class="hero__retry">
                <sv-button type="secondary" size="sm" :loading="filling" @click="fill"
                  >重试</sv-button
                >
              </view>
            </view>
          </view>
        </sv-card>

        <sv-group>
          <sv-cell title="文件夹" :value="folderName" arrow clickable @click="moveCard" />
          <sv-cell title="标签" :value="tagText" arrow clickable @click="editCardTags" />
          <sv-cell
            title="我的备注"
            :value="expression.note ? '' : '添加'"
            arrow
            clickable
            :divider="false"
            @click="editNote"
          />
        </sv-group>
        <view v-if="expression.note" class="note">
          <text>{{ expression.note }}</text>
        </view>

        <view class="block">
          <text class="block__label">收藏自</text>
          <sv-card :padding="2" radius="m">
            <view
              v-for="(s, i) in sources"
              :key="`${s.sessionId}-${s.vid}-${s.sentenceIndex}-${i}`"
              class="usage"
              :class="{ 'has-divider': i > 0 }"
              hover-class="is-pressed"
              :hover-stay-time="60"
              @tap="openSource(s)"
            >
              <view v-if="s.sentence" class="usage__sentence sv-en">
                <text
                  v-for="(p, j) in piecesOf(s.sentence)"
                  :key="j"
                  :class="{ usage__hit: p.hit }"
                  >{{ p.text }}</text
                >
              </view>
              <!-- 解析里推荐的说法不一定出现在原文里 -->
              <text v-else class="usage__none">解析里推荐的说法，原文没有直接用到</text>
              <text class="usage__meta">{{ sourceMeta(s) }}</text>
            </view>
          </sv-card>
        </view>

        <view class="block">
          <text class="block__label">也出现在</text>
          <sv-card v-if="usagesLoading" :padding="18" radius="m"><sv-skeleton :rows="2" /></sv-card>
          <sv-card v-else-if="usagesError" :padding="18" radius="m">
            <view class="usage__empty">
              <text>{{ usagesError }}</text>
              <sv-button type="secondary" size="sm" @click="loadUsages">重试</sv-button>
            </view>
          </sv-card>
          <sv-card v-else-if="usages.length === 0" :padding="18" radius="m">
            <text class="usage__empty">其他对话里还没用到它</text>
          </sv-card>
          <sv-card v-else :padding="2" radius="m">
            <view
              v-for="(u, i) in usages"
              :key="`${u.sessionId}-${u.vid}-${u.sentenceIndex}`"
              class="usage"
              :class="{ 'has-divider': i > 0 }"
              hover-class="is-pressed"
              :hover-stay-time="60"
              @tap="openSession(u.sessionId, u.vid, u.sentenceIndex)"
            >
              <view class="usage__sentence sv-en">
                <text
                  v-for="(p, j) in piecesOf(u.sentence)"
                  :key="j"
                  :class="{ usage__hit: p.hit }"
                  >{{ p.text }}</text
                >
              </view>
              <text class="usage__meta"
                >{{ u.sessionTitle }} · {{ formatRelative(u.updatedAt) }}</text
              >
            </view>
          </sv-card>
        </view>

        <view class="danger">
          <sv-button type="plain" block @click="unstarCard">
            <text class="danger__text">取消收藏</text>
          </sv-button>
        </view>
      </template>
    </view>

    <view :style="bottomInset" />
  </scroll-view>

  <folder-picker
    v-model:show="organizer.picker.show"
    :current="organizer.picker.current"
    @pick="organizer.onPick"
  />
  <tag-editor
    v-model:show="organizer.tagger.show"
    :tags="organizer.tagger.tags"
    :known="organizer.tagger.known"
    :saving="organizer.tagger.saving"
    @save="organizer.onTags"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import type { Expression, ExpressionKind, ExpressionOrigin, SourceView, Usage } from '@shared/types'
import FolderPicker from '@/components/library/FolderPicker.vue'
import TagEditor from '@/components/library/TagEditor.vue'
import { useAudio } from '@/composables/useAudio'
import { useOrganizer } from '@/composables/useOrganizer'
import { CloudError } from '@/services/cloud'
import { explainExpression, findUsages, getExpression, updateNote } from '@/services/library'
import { wordAudioPath } from '@/services/practice'
import { useLibraryStore } from '@/stores/library'
import { useSystemStore } from '@/stores/system'
import { promptText, toast } from '@/utils/dialog'
import { folderPath } from '@/utils/folders'
import { highlightPieces } from '@/utils/highlight'
import { formatRelative } from '@/utils/time'

const KIND_TEXT: Record<ExpressionKind, string> = {
  phrase: '关键表达',
  slang: '俚语与习语',
  word: '单词与短语',
}

const ORIGIN_TEXT: Record<ExpressionOrigin, string> = {
  analysis: '来自解析',
  sentence: '来自英文句子',
  report: '来自评分报告',
}

const store = useLibraryStore()
const { folders } = storeToRefs(store)
const { metrics } = storeToRefs(useSystemStore())
const audio = useAudio()

const expressionId = ref('')
const expression = ref<Expression | null>(null)
const sources = ref<SourceView[]>([])
const loadError = ref('')
const filling = ref(false)
const fillError = ref('')
const usages = ref<Usage[]>([])
const usagesLoading = ref(true)
const usagesError = ref('')

let disposed = false
onUnload(() => {
  disposed = true
})

const bottomInset = computed(() => `height:${metrics.value.safeAreaBottom + 24}px`)
const speakable = computed(() => /^[A-Za-z][A-Za-z' -]{0,59}$/.test(expression.value?.text ?? ''))
const folderName = computed(() => {
  const path = folderPath(folders.value, expression.value?.folderId ?? null)
  return path.length ? path.map((f) => f.name).join(' › ') : '未归类'
})
const tagText = computed(() => expression.value?.tags.map((t) => `#${t}`).join(' ') || '添加')

const organizer = useOrganizer((t) => {
  if (!expression.value) return
  expression.value = { ...expression.value, folderId: t.folderId, tags: t.tags }
})

onLoad((query) => {
  expressionId.value = String(query?.id ?? '')
  if (!store.loaded) void store.refresh()
  void load()
})

async function load() {
  loadError.value = ''
  try {
    const res = await getExpression(expressionId.value)
    expression.value = res.expression
    sources.value = res.sources
  } catch (err) {
    loadError.value = err instanceof CloudError ? err.message : '加载失败'
    return
  }
  void loadUsages()
  if (expression.value?.fill === 'pending') void fill()
}

async function loadUsages() {
  usagesLoading.value = true
  usagesError.value = ''
  try {
    usages.value = await findUsages(expressionId.value)
  } catch (err) {
    usagesError.value = err instanceof CloudError ? err.message : '查找失败'
  } finally {
    usagesLoading.value = false
  }
}

/** 补全释义：页面打开时还在生成就等结果；失败时点重试 */
async function fill() {
  if (filling.value || !expression.value) return
  filling.value = true
  fillError.value = ''
  expression.value = { ...expression.value, fill: 'pending' }
  try {
    const next = await explainExpression(expressionId.value, () => disposed)
    expression.value = { ...next, folderId: expression.value.folderId, tags: expression.value.tags }
  } catch (err) {
    if (disposed) return
    fillError.value = err instanceof CloudError ? err.message : '释义生成失败'
    if (expression.value) expression.value = { ...expression.value, fill: 'failed' }
  } finally {
    filling.value = false
    store.touch()
  }
}

function piecesOf(sentence: string) {
  return highlightPieces(sentence, expression.value?.text ?? '')
}

function sourceMeta(s: SourceView): string {
  const title = s.sessionTitle ?? '对话已删除'
  return `${title} · ${formatRelative(s.savedAt)} · ${ORIGIN_TEXT[s.from]}`
}

function openSource(s: SourceView) {
  if (s.sessionTitle === null) return toast('这个对话已经不在了')
  openSession(s.sessionId, s.vid, s.sentenceIndex)
}

function openSession(sessionId: string, vid: string, sentenceIndex: number) {
  audio.stop()
  uni.navigateTo({
    url: `/pkg-session/session/index?id=${encodeURIComponent(sessionId)}&vid=${encodeURIComponent(vid)}&s=${sentenceIndex}`,
  })
}

async function speak() {
  const text = expression.value?.text
  if (!text) return
  try {
    audio.play(await wordAudioPath(text))
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '发音加载失败')
  }
}

function target() {
  const e = expression.value!
  return { tab: 'expression' as const, id: e.id, folderId: e.folderId, tags: e.tags }
}

function moveCard() {
  if (expression.value) organizer.move(target())
}

function editCardTags() {
  if (expression.value) void organizer.editTags(target())
}

async function editNote() {
  const e = expression.value
  if (!e) return
  const note = await promptText({
    title: '我的备注',
    value: e.note,
    placeholder: '比如：和老板说话时用',
  })
  if (note === null || note === e.note) return
  try {
    expression.value = await updateNote(e.id, note)
  } catch (err) {
    toast(err instanceof CloudError ? err.message : '保存失败，请重试')
  }
}

async function unstarCard() {
  const e = expression.value
  if (!e) return
  if (await organizer.unstar(target(), e.text)) uni.navigateBack()
}
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.page-scroll {
  height: 100vh;
}

.card-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 16px 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block__label {
  padding: 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--sv-text-2);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.hero__text {
  flex: 1;
  font-size: 26px;
  line-height: 32px;
  font-weight: 700;
}

.hero__speak {
  @include sv-hit-area;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: var(--sv-accent-soft);

  &.is-pressed {
    opacity: 0.6;
  }
}

.hero__kind {
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);
}

.hero__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.hero__meaning {
  font-size: 17px;
  line-height: 25px;
  font-weight: 600;
}

.hero__usage {
  font-size: 15px;
  line-height: 22px;
  color: var(--sv-text-2);
}

.hero__example {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--sv-radius-s);
  font-size: 15px;
  line-height: 22px;
  background-color: var(--sv-fill);
}

.hero__hint {
  font-size: 14px;
  color: var(--sv-text-2);

  &.is-error {
    color: var(--sv-danger);
  }
}

.hero__retry {
  align-self: flex-start;
}

.note {
  margin-top: -12px;
  padding: 12px 16px;
  border-radius: var(--sv-radius-m);
  font-size: 15px;
  line-height: 22px;
  color: var(--sv-text-2);
  background-color: var(--sv-surface);
}

.usage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  transition: background-color var(--sv-dur-1) var(--sv-ease);

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.usage__sentence {
  font-size: 16px;
  line-height: 23px;
}

.usage__hit {
  font-weight: 700;
  color: var(--sv-accent);
}

.usage__none {
  font-size: 15px;
  line-height: 22px;
  color: var(--sv-text-2);
}

.usage__meta {
  font-size: 13px;
  line-height: 18px;
  color: var(--sv-text-2);
}

.usage__empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--sv-text-2);
}

.danger__text {
  color: var(--sv-danger);
}
</style>
