<script setup lang="ts">
import type { OscillatorPatch, Waveform } from '../audio/types'
import Knob from './Knob.vue'

defineProps<{
  index: number
  osc: OscillatorPatch
}>()

const waveforms: { id: Waveform; label: string; path: string }[] = [
  { id: 'sine', label: 'SIN', path: 'M 2 10 Q 5 2 10 10 T 18 10' },
  { id: 'triangle', label: 'TRI', path: 'M 2 10 L 6 2 L 14 18 L 18 10' },
  { id: 'sawtooth', label: 'SAW', path: 'M 2 18 L 10 2 L 10 18 L 18 2' },
  { id: 'square', label: 'SQR', path: 'M 2 18 L 2 4 L 10 4 L 10 18 L 18 18 L 18 4' },
]
</script>

<template>
  <div class="osc" :class="{ disabled: !osc.enabled }">
    <div class="head">
      <button
        class="toggle"
        :class="{ on: osc.enabled }"
        @click="osc.enabled = !osc.enabled"
        :title="osc.enabled ? 'Disable' : 'Enable'"
      >
        <span class="dot" />
        OSC {{ index + 1 }}
      </button>
    </div>

    <div class="waves">
      <button
        v-for="w in waveforms"
        :key="w.id"
        class="wave"
        :class="{ active: osc.waveform === w.id }"
        @click="osc.waveform = w.id"
        :title="w.label"
      >
        <svg viewBox="0 0 20 20" width="20" height="20">
          <path :d="w.path" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    </div>

    <div class="knobs">
      <Knob
        :model-value="osc.semitones"
        @update:model-value="osc.semitones = Math.round($event)"
        :min="-24"
        :max="24"
        :step="1"
        label="SEMI"
        :format="(v) => (v > 0 ? '+' : '') + v"
      />
      <Knob
        v-model="osc.detune"
        :min="-100"
        :max="100"
        :step="1"
        label="FINE"
        unit="c"
        :format="(v) => (v > 0 ? '+' : '') + v.toFixed(0)"
      />
      <Knob v-model="osc.level" :min="0" :max="1" label="LEVEL" :format="(v) => (v * 100).toFixed(0) + '%'" />
    </div>
  </div>
</template>

<style scoped>
.osc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  transition: opacity 150ms var(--ease-out);
}
@media (max-width: 640px) {
  .osc {
    padding: 10px;
    gap: 8px;
  }
  .knobs {
    gap: 2px;
  }
}
.osc.disabled {
  opacity: 0.45;
}
.head {
  display: flex;
  justify-content: space-between;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  border-radius: 4px;
}
.toggle .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  transition: background 120ms;
}
.toggle.on .dot {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
.waves {
  display: flex;
  gap: 4px;
}
.wave {
  padding: 4px;
  color: var(--text-dim);
  border-radius: 3px;
}
.wave.active {
  color: var(--accent);
  background: var(--accent-dim);
  border-color: var(--accent);
}
.knobs {
  display: flex;
  justify-content: space-around;
  gap: 4px;
}
</style>
