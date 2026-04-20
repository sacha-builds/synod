<script setup lang="ts">
import { computed } from 'vue'
import type { EnvelopePatch } from '../audio/types'
import Knob from './Knob.vue'

const props = defineProps<{
  title: string
  env: EnvelopePatch
}>()

// Visual envelope curve — normalized to panel width
const envPath = computed(() => {
  const w = 200
  const h = 40
  const total = props.env.attack + props.env.decay + 0.6 + props.env.release
  const scale = w / total
  const ax = props.env.attack * scale
  const dx = ax + props.env.decay * scale
  const sx = dx + 0.6 * scale
  const rx = w
  const sy = h - props.env.sustain * h
  return `M 0 ${h} L ${ax} 0 L ${dx} ${sy} L ${sx} ${sy} L ${rx} ${h}`
})

const fmtTime = (v: number) => {
  if (v < 1) return (v * 1000).toFixed(0) + 'ms'
  if (v < 10) return v.toFixed(2) + 's'
  return v.toFixed(1) + 's'
}
</script>

<template>
  <details class="panel env-panel" open>
    <summary class="panel-title">
      <span class="chevron">▾</span>
      {{ title }}
    </summary>
    <div class="graph">
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" width="100%" height="40">
        <path :d="envPath" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <path
          :d="envPath + ' L 200 40 L 0 40 Z'"
          fill="var(--accent)"
          opacity="0.08"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
    <div class="knobs">
      <Knob v-model="env.attack" :min="0.001" :max="20" curve="exp" label="ATTACK" :format="fmtTime" />
      <Knob v-model="env.decay" :min="0.001" :max="20" curve="exp" label="DECAY" :format="fmtTime" />
      <Knob v-model="env.sustain" :min="0" :max="1" label="SUSTAIN" :format="(v) => (v * 100).toFixed(0) + '%'" />
      <Knob v-model="env.release" :min="0.001" :max="20" curve="exp" label="RELEASE" :format="fmtTime" />
    </div>
  </details>
</template>

<style scoped>
.env-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.graph {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 6px;
  height: 52px;
}
.knobs {
  display: flex;
  justify-content: space-around;
  gap: 4px;
}
</style>
