<script setup lang="ts">
import type { SynthPatch } from '../audio/types'
import { ARP_MODES, ARP_RATES } from '../audio/Arp'
import Knob from './Knob.vue'

defineProps<{ patch: SynthPatch }>()

const fmtPct = (v: number) => (v * 100).toFixed(0) + '%'
const fmtInt = (v: number) => v.toFixed(0)
</script>

<template>
  <details class="panel arp-panel" :class="{ disabled: !patch.arp.enabled }" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      Arp
      <label class="enable-toggle" @click.stop>
        <input type="checkbox" v-model="patch.arp.enabled" />
        <span class="enable-pill" :class="{ on: patch.arp.enabled }">
          {{ patch.arp.enabled ? 'ON' : 'OFF' }}
        </span>
      </label>
    </summary>

    <div class="body" :class="{ dimmed: !patch.arp.enabled }">
      <div class="mode-row">
        <button
          v-for="m in ARP_MODES"
          :key="m.id"
          class="mode-btn"
          :class="{ active: patch.arp.mode === m.id }"
          :title="m.title"
          @click="patch.arp.mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="rate-row">
        <span class="sub-label">RATE</span>
        <div class="rate-buttons">
          <button
            v-for="r in ARP_RATES"
            :key="r.id"
            class="rate-btn"
            :class="{ active: patch.arp.rate === r.id }"
            @click="patch.arp.rate = r.id"
            :title="r.label"
          >
            {{ r.label }}
          </button>
        </div>
      </div>

      <div class="knobs">
        <Knob v-model="patch.arp.bpm" :min="30" :max="240" :step="1" label="BPM" :format="fmtInt" />
        <Knob
          v-model="patch.arp.octaves"
          :min="1"
          :max="4"
          :step="1"
          label="OCT"
          :format="fmtInt"
        />
        <Knob v-model="patch.arp.gate" :min="0.05" :max="1" label="GATE" :format="fmtPct" />
        <Knob v-model="patch.arp.swing" :min="0" :max="0.5" label="SWING" :format="fmtPct" />
        <label class="latch-toggle" @click.stop title="Hold the chord after releasing keys">
          <input type="checkbox" v-model="patch.arp.latch" />
          <span class="enable-pill small" :class="{ on: patch.arp.latch }">
            LATCH {{ patch.arp.latch ? 'ON' : 'OFF' }}
          </span>
        </label>
      </div>
    </div>
  </details>
</template>

<style scoped>
.enable-toggle,
.latch-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  position: relative;
}
.enable-toggle input,
.latch-toggle input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  margin: 0;
}
.enable-toggle {
  margin-left: auto;
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
.enable-pill.small {
  font-size: 8px;
  letter-spacing: 0.12em;
  padding: 4px 9px;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.body.dimmed {
  opacity: 0.45;
  pointer-events: none;
}

.mode-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.mode-btn {
  flex: 1;
  min-width: 56px;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  border-radius: 3px;
}
.mode-btn.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}

.rate-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-faint);
  flex-shrink: 0;
}
.rate-buttons {
  display: flex;
  gap: 3px;
  flex: 1;
  flex-wrap: wrap;
}
.rate-btn {
  flex: 1;
  min-width: 44px;
  padding: 4px 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: var(--text-dim);
  border-radius: 3px;
}
.rate-btn.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}

.knobs {
  display: flex;
  justify-content: space-around;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.latch-toggle {
  margin-left: auto;
}

@media (max-width: 640px) {
  .rate-btn {
    min-width: 38px;
    font-size: 8px;
  }
  .mode-btn {
    min-width: 48px;
    font-size: 9px;
  }
}
</style>
