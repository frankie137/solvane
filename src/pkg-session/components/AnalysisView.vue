<template>
  <view class="analysis">
    <sv-card v-if="analysis.keyPhrases.length" title="关键表达" :padding="18" radius="m">
      <view
        v-for="(item, i) in analysis.keyPhrases"
        :key="i"
        class="item"
        :class="{ 'has-divider': i > 0, 'is-first': i === 0 }"
      >
        <view class="item__row">
          <text class="item__phrase is-grow sv-en">{{ item.phrase }}</text>
          <view class="save" hover-class="is-pressed" @tap="emit('save', 'phrase', i)">
            <sv-icon
              :name="isSaved(item.phrase) ? 'bookmark.fill' : 'bookmark'"
              :size="18"
              color="var(--sv-accent)"
            />
          </view>
        </view>
        <text class="item__body">{{ item.meaning }}</text>
        <text class="item__note">{{ item.usage }}</text>
        <text class="item__example sv-en">{{ item.example }}</text>
      </view>
    </sv-card>

    <sv-card v-if="analysis.slang.length" title="俚语与习语" :padding="18" radius="m">
      <view
        v-for="(item, i) in analysis.slang"
        :key="i"
        class="item"
        :class="{ 'has-divider': i > 0, 'is-first': i === 0 }"
      >
        <view class="item__row">
          <text class="item__phrase sv-en">{{ item.phrase }}</text>
          <text class="tag">{{ item.register }}</text>
          <text class="tag">{{ item.region }}</text>
          <view class="item__spacer" />
          <view class="save" hover-class="is-pressed" @tap="emit('save', 'slang', i)">
            <sv-icon
              :name="isSaved(item.phrase) ? 'bookmark.fill' : 'bookmark'"
              :size="18"
              color="var(--sv-accent)"
            />
          </view>
        </view>
        <text class="item__body">{{ item.meaning }}</text>
      </view>
    </sv-card>

    <sv-card v-if="analysis.chinglish.length" title="中式英语对比" :padding="18" radius="m">
      <view
        v-for="(item, i) in analysis.chinglish"
        :key="i"
        class="item"
        :class="{ 'has-divider': i > 0, 'is-first': i === 0 }"
      >
        <view class="compare">
          <text class="compare__mark is-bad">×</text>
          <text class="compare__text is-bad sv-en">{{ item.literal }}</text>
        </view>
        <view class="compare">
          <text class="compare__mark is-good">✓</text>
          <text class="compare__text sv-en">{{ item.natural }}</text>
        </view>
        <text class="item__note">{{ item.why }}</text>
      </view>
    </sv-card>

    <sv-card v-if="analysis.culture.length" title="文化背景" :padding="18" radius="m">
      <view
        v-for="(item, i) in analysis.culture"
        :key="i"
        class="item"
        :class="{ 'has-divider': i > 0, 'is-first': i === 0 }"
      >
        <text class="item__title">{{ item.topic }}</text>
        <text class="item__body">{{ item.note }}</text>
      </view>
    </sv-card>
  </view>
</template>

<script setup lang="ts">
import { expressionKey } from '@shared/expression'
import type { Analysis } from '@shared/types'

const props = withDefaults(
  defineProps<{
    analysis: Analysis
    /** Merge key of saved expressions → id, used to show the filled save icon */
    savedKeys?: Record<string, string>
  }>(),
  { savedKeys: () => ({}) },
)

/** Save tapped: index of the item within key expressions or slang */
const emit = defineEmits<{ save: [kind: 'phrase' | 'slang', index: number] }>()

const isSaved = (phrase: string) => Boolean(props.savedKeys[expressionKey(phrase)])
</script>

<style lang="scss">
@import '@/styles/mixins.scss';

.analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
  @include sv-appear;
}

.item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;

  &.is-first {
    padding-top: 0;
  }

  &.has-divider::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 0.5px;
    background-color: var(--sv-separator);
  }
}

.item__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.item__spacer {
  flex: 1;
}

.save {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: -8px -8px -8px 0;
  border-radius: 18px;
  flex-shrink: 0;
  @include sv-hit-area;

  &.is-pressed {
    background-color: var(--sv-fill);
  }
}

.item__phrase {
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
  color: var(--sv-accent);

  &.is-grow {
    flex: 1;
  }
}

.item__title {
  font-size: 16px;
  line-height: 21px;
  font-weight: 600;
}

.item__body {
  font-size: 15px;
  line-height: 21px;
  color: var(--sv-text);
}

.item__note {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
}

.item__example {
  font-size: 14px;
  line-height: 20px;
  color: var(--sv-text-2);
  font-style: italic;
}

.tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sv-text-2);
  background-color: var(--sv-fill);
}

.compare {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.compare__mark {
  width: 14px;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;

  &.is-bad {
    color: var(--sv-danger);
  }

  &.is-good {
    color: var(--sv-success);
  }
}

.compare__text {
  font-size: 16px;
  line-height: 22px;

  &.is-bad {
    color: var(--sv-text-2);
    text-decoration: line-through;
  }
}
</style>
