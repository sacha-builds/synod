<script setup lang="ts">
import { ref } from 'vue'
import type { SynthPatch } from '../audio/types'
import { cloneSynthPatch, randomize, restoreSynthPatch, type RandomizeGroup } from '../audio/randomize'

const props = defineProps<{ patch: SynthPatch }>()

const amount = ref(0.35)

/** Two stacks for undo/redo. A new roll clears the redo stack as usual. */
const undoStack = ref<SynthPatch[]>([])
const redoStack = ref<SynthPatch[]>([])
const HISTORY_MAX = 16

const groups: { id: RandomizeGroup; label: string; title: string }[] = [
  { id: 'all', label: 'ALL', title: 'Randomize every parameter group' },
  { id: 'osc', label: 'OSC', title: 'Randomize oscillators (waveform, tuning, level)' },
  { id: 'env', label: 'ENV', title: 'Randomize amp + filter envelopes' },
  { id: 'filter', label: 'FILT', title: 'Randomize both filters and routing' },
  { id: 'voice', label: 'VOICE', title: 'Randomize voice params (glide in mono)' },
]

function roll(group: RandomizeGroup) {
  undoStack.value.push(cloneSynthPatch(props.patch))
  if (undoStack.value.length > HISTORY_MAX) undoStack.value.shift()
  redoStack.value = []
  randomize(props.patch, group, amount.value)
}

function undo() {
  const snap = undoStack.value.pop()
  if (!snap) return
  redoStack.value.push(cloneSynthPatch(props.patch))
  restoreSynthPatch(props.patch, snap)
}

function redo() {
  const snap = redoStack.value.pop()
  if (!snap) return
  undoStack.value.push(cloneSynthPatch(props.patch))
  restoreSynthPatch(props.patch, snap)
}
</script>

<template>
  <details class="panel randomize-panel" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      Randomize
      <span class="amount-readout">· {{ (amount * 100).toFixed(0) }}%</span>
    </summary>
    <div class="row">
      <div class="amount-cell">
        <label class="mini-label">AMOUNT</label>
        <input
          type="range"
          :value="amount"
          @input="amount = parseFloat(($event.target as HTMLInputElement).value)"
          min="0"
          max="1"
          step="0.01"
          class="amount-slider"
          :title="`${(amount * 100).toFixed(0)}% toward random`"
        />
      </div>
      <div class="groups">
        <button v-for="g in groups" :key="g.id" class="group-btn" :title="g.title" @click="roll(g.id)">
          <span class="die">🎲</span>
          {{ g.label }}
        </button>
      </div>
      <div class="history">
        <button
          class="hist-btn"
          :disabled="undoStack.length === 0"
          :title="`Undo (${undoStack.length})`"
          @click="undo"
        >
          ↶
        </button>
        <button
          class="hist-btn"
          :disabled="redoStack.length === 0"
          :title="`Redo (${redoStack.length})`"
          @click="redo"
        >
          ↷
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped>
.randomize-panel {
  /* Deliberately compact — a single row of controls rather than a tall panel. */
  padding-top: 10px;
  padding-bottom: 10px;
}
.amount-readout {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-faint);
  margin-left: 2px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.amount-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 0 1 140px;
  min-width: 110px;
}
.mini-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}
.amount-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: var(--bg-2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.amount-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
}
.amount-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
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
  padding: 6px 9px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  border-radius: 3px;
  -webkit-tap-highlight-color: transparent;
  transition: all 100ms var(--ease-out);
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
  transform: scale(0.96);
}
.die {
  font-size: 11px;
  filter: saturate(0) brightness(1.1);
}

.history {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.hist-btn {
  padding: 5px 9px;
  font-size: 14px;
  line-height: 1;
  color: var(--text-dim);
  border-radius: 3px;
  min-width: 32px;
}
.hist-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
@media (hover: hover) {
  .hist-btn:not(:disabled):hover {
    color: var(--accent-hi);
    border-color: var(--line-hi);
  }
}
</style>
