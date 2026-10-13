<template>
  <view class="sv-icon" :style="style" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { iconDataUri, type IconName } from './icons'

defineOptions({ options: { virtualHost: true } })

const props = withDefaults(
  defineProps<{
    name: IconName
    /** Side length in px */
    size?: number
    /** Defaults to the current text color */
    color?: string
    /** Stroke width */
    weight?: number
  }>(),
  { size: 22, color: 'currentColor', weight: 1.8 },
)

// Object-style style bindings drop the -webkit- prefix in mini programs, so build the string directly
const style = computed(() => {
  const url = `url(${iconDataUri(props.name, props.weight)})`
  return [
    `width:${props.size}px`,
    `height:${props.size}px`,
    `background-color:${props.color}`,
    `-webkit-mask-image:${url}`,
    `mask-image:${url}`,
  ].join(';')
})
</script>

<style lang="scss">
.sv-icon {
  display: inline-block;
  flex-shrink: 0;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  transition: background-color var(--sv-dur-1) var(--sv-ease);
}
</style>
