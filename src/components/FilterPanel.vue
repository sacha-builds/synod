<script setup lang="ts">
import type { FilterPatch, FilterType } from '../audio/types'
import Knob from './Knob.vue'

withDefaults(
  defineProps<{
    filter: FilterPatch
    title?: string
    showEnable?: boolean
  }>(),
  {
    title: 'Filter',
    showEnable: false,
  },
)

const fmtHz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(2) + 'k' : v.toFixed(0)) + 'Hz'

/** Each filter type's response curve sketch. Purely visual. */
const types: { id: FilterType; label: string; path: string }[] = [
  { id: 'lowpass', label: 'LP', path: 'M 1 4 L 10 4 Q 14 4 14 13 L 23 13' },
  { id: 'highpass', label: 'HP', path: 'M 1 13 L 10 13 Q 14 13 14 4 L 23 4' },
  { id: 'bandpass', label: 'BP', path: 'M 1 13 L 8 13 Q 12 13 12 4 Q 12 13 16 13 L 23 13' },
  { id: 'notch', label: 'NOTCH', path: 'M 1 4 L 9 4 Q 12 4 12 13 Q 12 4 15 4 L 23 4' },
  { id: 'allpass', label: 'AP', path: 'M 1 7 L 23 7 M 1 11 L 23 11' },
]
</script>

<template>
  <details class="panel" :class="{ disabled: showEnable && !filter.enabled }" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      {{ title }}
      <label v-if="showEnable" class="enable-toggle" @click.stop>
        <input type="checkbox" v-model="filter.enabled" />
        <span class="enable-pill" :class="{ on: filter.enabled }">{{ filter.enabled ? 'ON' : 'OFF' }}</span>
      </label>
    </summary>

    <div class="body" :class="{ dimmed: showEnable && !filter.enabled }">
      <div class="type-row">
        <button
          v-for="t in types"
          :key="t.id"
          class="type"
          :class="{ active: filter.type === t.id }"
          @click="filter.type = t.id"
          :title="t.label"
        >
          <svg viewBox="0 0 24 14" width="24" height="14" aria-hidden="true">
            <path :d="t.path" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
          <span class="type-label">{{ t.label }}</span>
        </button>
      </div>
      <div class="knobs">
        <Knob v-model="filter.cutoff" :min="20" :max="20000" curve="exp" label="CUTOFF" :format="fmtHz" />
        <Knob v-model="filter.resonance" :min="0.1" :max="20" curve="exp" label="RES" :format="(v) => v.toFixed(1)" />
        <Knob v-model="filter.envAmount" :min="0" :max="10000" curve="exp" label="ENV AMT" :format="fmtHz" />
      </div>
    </div>
  </details>
</template>

<style scoped>
.panel-title {
  position: relative;
}
.enable-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  position: relative;
}
.enable-toggle input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  margin: 0;
}
.enable-pill {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  border-radius: 10px;
  background: var(--bg-2);
  color: var(--text-faint);
  border: 1px solid var(--line);
  transition: all 120ms var(--ease-out);
}
.enable-pill.on {
  background: var(--accent-dim);
  color: var(--accent-hi);
  border-color: var(--accent);
}

.body.dimmed {
  opacity: 0.35;
  pointer-events: none;
}

.type-row {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.type {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 7px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  border-radius: 3px;
  min-width: 42px;
}
.type.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}
.type-label {
  font-family: var(--font-mono);
}
.knobs {
  display: flex;
  justify-content: space-around;
  gap: 8px;
}
</style>
