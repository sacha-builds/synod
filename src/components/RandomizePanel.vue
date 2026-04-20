<script setup lang="ts">
import { ref } from 'vue'
import type { SynthPatch } from '../audio/types'
import { cloneSynthPatch, randomize, restoreSynthPatch, type RandomizeGroup } from '../audio/randomize'
import Knob from './Knob.vue'

const props = defineProps<{ patch: SynthPatch }>()

// Amount is 0..1 internally but shown as a 0..100 percent.
const amount = ref(0.35)

// Undo history — deep snapshots pushed before each randomize.
const history = ref<SynthPatch[]>([])
const HISTORY_MAX = 12

const groups: { id: RandomizeGroup; label: string; title: string }[] = [
  { id: 'all', label: 'ALL', title: 'Randomize every parameter group' },
  { id: 'osc', label: 'OSC', title: 'Randomize oscillators (waveform, tuning, level)' },
  { id: 'env', label: 'ENV', title: 'Randomize amp + filter envelopes' },
  { id: 'filter', label: 'FILT', title: 'Randomize both filters and routing' },
  { id: 'voice', label: 'VOICE', title: 'Randomize voice params (glide in mono)' },
]

function roll(group: RandomizeGroup) {
  // Snapshot the current patch before any changes so undo is possible.
  history.value.push(cloneSynthPatch(props.patch))
  if (history.value.length > HISTORY_MAX) history.value.shift()
  randomize(props.patch, group, amount.value)
}

function undo() {
  const snap = history.value.pop()
  if (!snap) return
  restoreSynthPatch(props.patch, snap)
}
</script>

<template>
  <details class="panel randomize-panel" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      Randomize
    </summary>
    <div class="row">
      <Knob
        v-model="amount"
        :min="0"
        :max="1"
        label="AMOUNT"
        :format="(v) => (v * 100).toFixed(0) + '%'"
        title="How far toward random. 0% = no change, 100% = fully random."
      />
      <div class="groups">
        <button
          v-for="g in groups"
          :key="g.id"
          class="group-btn"
          :title="g.title"
          @click="roll(g.id)"
        >
          <span class="die">🎲</span>
          {{ g.label }}
        </button>
      </div>
      <button
        class="undo-btn"
        :disabled="history.length === 0"
        :title="`Undo last randomize (${history.length} stacked)`"
        @click="undo"
      >
        ↶ UNDO
      </button>
    </div>
  </details>
</template>

<style scoped>
.randomize-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.groups {
  display: flex;
  flex: 1;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}
.group-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  border-radius: 3px;
  transition: all 100ms var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .group-btn:hover {
    color: var(--accent-hi);
    border-color: var(--accent);
  }
}
.group-btn:active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent-hi);
  transform: scale(0.97);
}
.die {
  font-size: 12px;
  filter: saturate(0) brightness(1.1);
}
.undo-btn {
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  border-radius: 3px;
}
.undo-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
@media (hover: hover) {
  .undo-btn:not(:disabled):hover {
    color: var(--text);
    border-color: var(--line-hi);
  }
}

@media (max-width: 520px) {
  .row {
    gap: 8px;
  }
  .group-btn {
    padding: 6px 8px;
    font-size: 9px;
    letter-spacing: 0.1em;
  }
  .undo-btn {
    padding: 6px 8px;
    font-size: 9px;
  }
}
</style>
