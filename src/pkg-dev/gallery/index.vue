<template>
  <scroll-view class="gallery-scroll" scroll-y :enhanced="true" :bounces="true" @scroll="onScroll">
    <sv-nav-bar title="组件预览" back :collapsed="collapsed" />

    <view class="gallery">
      <sv-group header="字号">
        <view class="gallery__block">
          <text class="sv-large-title">Large Title 大标题</text>
          <text class="sv-title-1">Title 1 标题一</text>
          <text class="sv-title-2">Title 2 标题二</text>
          <text class="sv-title-3">Title 3 标题三</text>
          <text class="sv-headline">Headline 强调</text>
          <text class="sv-body">Body 正文 · How's it going?</text>
          <text class="sv-subhead sv-secondary">Subhead 次要说明</text>
          <text class="sv-footnote sv-secondary">Footnote 脚注</text>
          <text class="sv-caption sv-tertiary">Caption 注释</text>
        </view>
      </sv-group>

      <sv-group header="颜色">
        <view class="gallery__swatches">
          <view v-for="c in COLORS" :key="c" class="gallery__swatch">
            <view class="gallery__chip" :style="`background:var(${c})`" />
            <text class="sv-caption sv-secondary">{{ c.replace('--sv-', '') }}</text>
          </view>
        </view>
      </sv-group>

      <sv-group header="按钮">
        <view class="gallery__block gallery__block--row">
          <sv-button size="lg">主要</sv-button>
          <sv-button type="secondary">次要</sv-button>
          <sv-button type="plain">文字</sv-button>
          <sv-button size="sm" :loading="true">加载中</sv-button>
          <sv-button size="sm" :disabled="true">不可用</sv-button>
          <sv-button block haptic>
            <sv-icon name="mic" :size="20" color="#fff" />
            <text>整行按钮</text>
          </sv-button>
        </view>
      </sv-group>

      <sv-group header="图标">
        <view class="gallery__icons">
          <view v-for="name in ICON_NAMES" :key="name" class="gallery__icon">
            <sv-icon :name="name" :size="26" />
            <text class="sv-caption sv-tertiary">{{ name }}</text>
          </view>
        </view>
      </sv-group>

      <view>
        <text class="gallery__label">卡片与骨架屏</text>
        <sv-card title="卡片标题">
          <sv-skeleton :rows="3" title />
        </sv-card>
      </view>

      <sv-group header="列表" footer="组内最后一项不显示分隔线。">
        <sv-cell title="带图标和箭头" icon="sliders" arrow clickable />
        <sv-cell title="带取值" icon="globe" icon-bg="#0a84ff" value="美式" />
        <sv-cell title="纯文字" :divider="false" value="v0.0.0" />
      </sv-group>
    </view>

    <view class="gallery__bottom" />
  </scroll-view>
</template>

<script setup lang="ts">
import { ICON_NAMES } from '@/components/sv-icon/icons'
import { useCollapsingTitle } from '@/composables/useCollapsingTitle'

const { collapsed, onScroll } = useCollapsingTitle()

const COLORS = [
  '--sv-accent',
  '--sv-accent-blue',
  '--sv-accent-gradient',
  '--sv-accent-soft',
  '--sv-success',
  '--sv-warning',
  '--sv-danger',
  '--sv-text',
  '--sv-text-2',
  '--sv-text-3',
  '--sv-fill',
  '--sv-surface',
]
</script>

<style lang="scss">
.gallery-scroll {
  height: 100vh;
}

.gallery {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 0 16px;
}

.gallery__label {
  display: block;
  padding: 0 16px;
  margin-bottom: 7px;
  font-size: 13px;
  color: var(--sv-text-2);
}

.gallery__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.gallery__block--row {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.gallery__swatches,
.gallery__icons {
  display: flex;
  flex-wrap: wrap;
  padding: 12px 8px;
}

.gallery__swatch,
.gallery__icon {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  text-align: center;
}

.gallery__chip {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 0.5px solid var(--sv-separator);
}

.gallery__bottom {
  height: 60px;
}
</style>
