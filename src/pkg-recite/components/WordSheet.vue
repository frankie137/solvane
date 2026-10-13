<template>
  <sv-sheet :show="show" :title="word?.word ?? ''" @update:show="emit('update:show', $event)">
    <view v-if="word" class="word">
      <view class="word__score">
        <text class="word__value sv-en" :class="`is-${tone}`">{{
          word.accuracy >= 0 ? Math.round(word.accuracy) : '—'
        }}</text>
        <text class="word__caption">发音得分</text>
      </view>

      <view v-if="phoneIssues.length" class="word__block">
        <text class="word__label">这些音没发准</text>
        <view class="word__phones">
          <text v-for="(p, i) in phoneIssues" :key="i" class="word__phone sv-en">{{ p }}</text>
        </view>
      </view>

      <view v-if="tip" class="word__block">
        <text class="word__label">怎么发</text>
        <text class="word__text">{{ tip.issue }}</text>
        <text class="word__text">{{ tip.howTo }}</text>
      </view>

      <view class="word__actions">
        <view class="word__action">
          <sv-button
            type="secondary"
            block
            :loading="loadingStandard"
            @click="emit('play-standard')"
          >
            <sv-icon name="speaker" :size="16" />
            <text>标准发音</text>
          </sv-button>
        </view>
        <view class="word__action">
          <sv-button type="secondary" block :disabled="!canPlayMine" @click="emit('play-mine')">
            <sv-icon name="play.fill" :size="14" />
            <text>我的发音</text>
          </sv-button>
        </view>
      </view>

      <sv-button type="plain" block :loading="saving" @click="emit('save')">
        <sv-icon :name="saved ? 'bookmark.fill' : 'bookmark'" :size="16" color="var(--sv-accent)" />
        <text>{{ saved ? '已收藏，查看卡片' : '收藏这个词' }}</text>
      </sv-button>
    </view>
  </sv-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PronunciationTip, ScoredWord } from '@shared/types'
import { scoreTone } from '@/utils/recite'

const props = defineProps<{
  show: boolean
  word: ScoredWord | null
  tip: PronunciationTip | null
  canPlayMine: boolean
  loadingStandard: boolean
  /** This word is already saved */
  saved: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'play-standard': []
  'play-mine': []
  save: []
}>()

const tone = computed(() => (props.word ? scoreTone(props.word.accuracy) : 'none'))

/** Low-accuracy phonemes: "expected / actual" if misread as another sound, else just the score */
const phoneIssues = computed(() =>
  (props.word?.phones ?? [])
    .filter((p) => p.accuracy >= 0 && p.accuracy < 70)
    .map((p) =>
      p.phone && p.phone !== p.refPhone
        ? `/${p.refPhone}/ 读成了 /${p.phone}/`
        : `/${p.refPhone}/ ${Math.round(p.accuracy)} 分`,
    ),
)
</script>

<style lang="scss">
.word {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 8px;
}

.word__score {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.word__value {
  font-size: 36px;
  line-height: 40px;
  font-weight: 700;

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

.word__caption {
  font-size: 14px;
  color: var(--sv-text-2);
}

.word__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.word__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sv-text-2);
}

.word__phones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.word__phone {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 15px;
  background-color: var(--sv-fill);
}

.word__text {
  font-size: 15px;
  line-height: 22px;
}

.word__actions {
  display: flex;
  gap: 12px;
}

.word__action {
  flex: 1;
}
</style>
