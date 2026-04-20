<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDrag } from '../composables/useDrag'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    step?: number
    /** Display curve. linear = linear, exp = exponential (for Hz / time) */
    curve?: 'linear' | 'exp'
    label?: string
    unit?: string
    /** Format the displayed value. */
    format?: (v: number) => string
    size?: number
  }>(),
  {
    step: 0.001,
    curve: 'linear',
    size: 52,
    label: '',
    unit: '',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const hovering = ref(false)

const norm = computed(() => {
  if (props.curve === 'exp') {
    const logMin = Math.log(Math.max(props.min, 0.0001))
    const logMax = Math.log(props.max)
    return (Math.log(Math.max(props.modelValue, 0.0001)) - logMin) / (logMax - logMin)
  }
  return (props.modelValue - props.min) / (props.max - props.min)
})

function setFromNorm(n: number) {
  const clamped = Math.max(0, Math.min(1, n))
  let v: number
  if (props.curve === 'exp') {
    const logMin = Math.log(Math.max(props.min, 0.0001))
    const logMax = Math.log(props.max)
    v = Math.exp(logMin + clamped * (logMax - logMin))
  } else {
    v = props.min + clamped * (props.max - props.min)
  }
  if (props.step) {
    v = Math.round(v / props.step) * props.step
  }
  emit('update:modelValue', v)
}

const { onPointerDown } = useDrag((deltaY) => {
  const sensitivity = 1 / 200 // 200px = full range
  setFromNorm(norm.value + deltaY * sensitivity)
})

function onDoubleClick() {
  // Reset not implemented — future: support resetValue prop
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const sensitivity = e.shiftKey ? 0.002 : 0.01
  setFromNorm(norm.value - e.deltaY * sensitivity)
}

// SVG arc — knob indicator sweeps from -135deg to +135deg (270° total)
const angleDeg = computed(() => -135 + norm.value * 270)
const trackStart = -135
const trackEnd = 135
const radius = computed(() => props.size / 2 - 5)
const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)

function arcPath(fromDeg: number, toDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180
  const r = radius.value
  const x1 = cx.value + r * Math.cos(rad(fromDeg))
  const y1 = cy.value + r * Math.sin(rad(fromDeg))
  const x2 = cx.value + r * Math.cos(rad(toDeg))
  const y2 = cy.value + r * Math.sin(rad(toDeg))
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

const trackPath = computed(() => arcPath(trackStart, trackEnd))
const valuePath = computed(() => arcPath(trackStart, Math.max(trackStart + 0.01, angleDeg.value)))

const displayValue = computed(() => {
  if (props.format) return props.format(props.modelValue)
  const v = props.modelValue
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
})
</script>

<template>
  <div class="knob-wrap" @mouseenter="hovering = true" @mouseleave="hovering = false">
    <div
      class="knob"
      :style="{ width: size + 'px', height: size + 'px' }"
      @pointerdown="onPointerDown"
      @dblclick="onDoubleClick"
      @wheel="onWheel"
    >
      <svg :width="size" :height="size">
        <path :d="trackPath" class="track" />
        <path :d="valuePath" class="value" />
        <line
          :x1="cx"
          :y1="cy"
          :x2="cx + (radius - 4) * Math.cos(((angleDeg - 90) * Math.PI) / 180)"
          :y2="cy + (radius - 4) * Math.sin(((angleDeg - 90) * Math.PI) / 180)"
          class="indicator"
        />
        <circle :cx="cx" :cy="cy" :r="radius - 8" class="cap" />
      </svg>
    </div>
    <div class="readout">
      <span v-if="!hovering && label" class="label">{{ label }}</span>
      <span v-else class="value-text">{{ displayValue }}{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.knob-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 60px;
}
.knob {
  position: relative;
  touch-action: none;
}
.track {
  fill: none;
  stroke: var(--line);
  stroke-width: 2;
  stroke-linecap: round;
}
.value {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px var(--accent-dim));
}
.indicator {
  stroke: var(--text);
  stroke-width: 2;
  stroke-linecap: round;
}
.cap {
  fill: var(--bg-2);
  stroke: var(--line-hi);
  stroke-width: 1;
}
.readout {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: center;
  min-height: 12px;
  font-family: var(--font-mono);
}
.value-text {
  color: var(--accent-hi);
}
</style>
