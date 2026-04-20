<script setup lang="ts">
import type { SynthPatch } from '../audio/types'
import Knob from './Knob.vue'

defineProps<{ patch: SynthPatch }>()

const fmtTime = (v: number) => {
  if (v < 1) return (v * 1000).toFixed(0) + 'ms'
  return v.toFixed(2) + 's'
}
const fmtPct = (v: number) => (v * 100).toFixed(0) + '%'
</script>

<template>
  <details class="panel fx-panel" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      FX
    </summary>

    <div class="fx-grid">
      <div class="fx-slot" :class="{ dimmed: !patch.fx.reverb.enabled }">
        <div class="fx-header">
          <span class="fx-name">REVERB</span>
          <label class="enable-toggle" @click.stop>
            <input type="checkbox" v-model="patch.fx.reverb.enabled" />
            <span class="enable-pill" :class="{ on: patch.fx.reverb.enabled }">
              {{ patch.fx.reverb.enabled ? 'ON' : 'OFF' }}
            </span>
          </label>
        </div>
        <div class="knobs">
          <Knob v-model="patch.fx.reverb.decay" :min="0.3" :max="8" curve="exp" label="DECAY" :format="fmtTime" />
          <Knob v-model="patch.fx.reverb.mix" :min="0" :max="1" label="MIX" :format="fmtPct" />
        </div>
      </div>

      <div class="fx-slot" :class="{ dimmed: !patch.fx.delay.enabled }">
        <div class="fx-header">
          <span class="fx-name">DELAY</span>
          <label class="enable-toggle" @click.stop>
            <input type="checkbox" v-model="patch.fx.delay.enabled" />
            <span class="enable-pill" :class="{ on: patch.fx.delay.enabled }">
              {{ patch.fx.delay.enabled ? 'ON' : 'OFF' }}
            </span>
          </label>
        </div>
        <div class="knobs">
          <Knob v-model="patch.fx.delay.time" :min="0.01" :max="2" curve="exp" label="TIME" :format="fmtTime" />
          <Knob
            v-model="patch.fx.delay.feedback"
            :min="0"
            :max="0.95"
            label="FEEDBACK"
            :format="fmtPct"
          />
          <Knob v-model="patch.fx.delay.mix" :min="0" :max="1" label="MIX" :format="fmtPct" />
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
.fx-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.fx-slot {
  padding: 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: opacity 120ms var(--ease-out);
}
.fx-slot.dimmed {
  opacity: 0.45;
}
.fx-slot.dimmed .knobs {
  pointer-events: none;
}
.fx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.fx-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-dim);
}
.enable-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.enable-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.enable-pill {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  border-radius: 10px;
  background: var(--bg-1);
  color: var(--text-faint);
  border: 1px solid var(--line);
  transition: all 120ms var(--ease-out);
}
.enable-pill.on {
  background: var(--accent-dim);
  color: var(--accent-hi);
  border-color: var(--accent);
}
.knobs {
  display: flex;
  justify-content: space-around;
  gap: 6px;
}

@media (max-width: 640px) {
  .fx-grid {
    grid-template-columns: 1fr;
  }
}
</style>
