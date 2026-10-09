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
      <sv-card class="hero" :padding="24">
        <text class="hero__title sv-title-2">今天想说点什么？</text>
        <text class="hero__desc sv-subhead sv-secondary">
          用中文说出你的想法，哪怕只是只言片语，我来帮你变成地道的英文。
        </text>

        <view class="hero__mic-wrap">
          <view class="hero__ring" />
          <view class="hero__ring hero__ring--late" />
          <view class="hero__mic" hover-class="is-pressed" :hover-stay-time="80" @tap="comingSoon">
            <sv-icon name="mic.fill" :size="34" color="var(--sv-text-on-accent)" :weight="2" />
          </view>
        </view>
        <text class="hero__hint sv-footnote sv-secondary">按住说话 · 最长 60 秒</text>

        <sv-button type="secondary" size="sm" @click="comingSoon">
          <sv-icon name="keyboard" :size="18" />
          <text>打字输入</text>
        </sv-button>
      </sv-card>

      <view class="section">
        <text class="section__title sv-title-3">最近对话</text>
        <sv-card class="empty" :padding="24">
          <view class="empty__icon">
            <sv-icon name="sparkles" :size="26" />
          </view>
          <text class="sv-headline">还没有对话</text>
          <text class="sv-subhead sv-secondary">说出第一段话，这里会记录你的每一次练习。</text>
        </sv-card>
      </view>
    </view>

    <view :style="bottomInset" />
  </scroll-view>
</template>

<script setup lang="ts">
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'
import { useTabBarInset } from '@/composables/useTabBarInset'

const { collapsed, onScroll } = useCollapsingTitle()
const bottomInset = useTabBarInset()

function comingSoon() {
  uni.showToast({ title: '语音输入将在 M1 开放', icon: 'none' })
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
  transition: transform var(--sv-dur-2) var(--sv-ease-spring);

  &.is-pressed {
    transform: scale(0.94);
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.empty__icon {
  width: 52px;
  height: 52px;
  margin-bottom: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sv-accent);
  background-color: var(--sv-accent-soft);
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
