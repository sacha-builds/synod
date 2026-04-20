<script setup lang="ts">
import { computed } from 'vue'
import type { BiMode, SynthPatch } from '../audio/types'

const props = defineProps<{ patch: SynthPatch }>()

const BIMODES: { id: BiMode; label: string; title: string }[] = [
  { id: 'single', label: 'SINGLE', title: 'One part plays the keyboard' },
  { id: 'layer', label: 'LAYER', title: 'Both parts play every note together' },
  { id: 'split', label: 'SPLIT', title: 'Part A below the split note; Part B at and above' },
]

const isBitimbral = computed(() => props.patch.bimode !== 'single')

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function noteName(midi: number): string {
  return `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`
}

function setPart(idx: 0 | 1) {
  props.patch.activePart = idx
}

function setBimode(m: BiMode) {
  props.patch.bimode = m
  // In SPLIT mode, both parts are simultaneously active — but editing B is
  // usually what you want next, so auto-select if we just turned it on.
  if (m === 'layer' || m === 'split') {
    // Keep current activePart — user can flip.
  }
}

function setSplit(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  props.patch.splitNote = Math.max(0, Math.min(127, v))
}
</script>

<template>
  <div class="perf-bar">
    <div class="bimode">
      <span class="label">MODE</span>
      <div class="mode-buttons">
        <button
          v-for="m in BIMODES"
          :key="m.id"
          class="mode-btn"
          :class="{ active: patch.bimode === m.id }"
          :title="m.title"
          @click="setBimode(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div class="split-cell" v-if="patch.bimode === 'split'">
      <span class="label">SPLIT</span>
      <input
        type="range"
        :value="patch.splitNote"
        min="24"
        max="96"
        step="1"
        class="split-slider"
        @input="setSplit"
      />
      <span class="split-value">{{ noteName(patch.splitNote) }}</span>
    </div>

    <div class="part-tabs" v-if="isBitimbral">
      <span class="label">EDITING</span>
      <button
        class="part-btn"
        :class="{ active: patch.activePart === 0 }"
        @click="setPart(0)"
        title="Edit Part A"
      >
        A
      </button>
      <button
        class="part-btn"
        :class="{ active: patch.activePart === 1 }"
        @click="setPart(1)"
        title="Edit Part B"
      >
        B
      </button>
    </div>
  </div>
</template>

<style scoped>
.perf-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 12px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.bimode,
.split-cell,
.part-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-faint);
}

.mode-buttons {
  display: flex;
  gap: 3px;
}
.mode-btn {
  padding: 5px 10px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  border-radius: 3px;
  -webkit-tap-highlight-color: transparent;
}
.mode-btn.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}

.split-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 140px;
  height: 4px;
  background: var(--bg-2);
  border-radius: 2px;
}
.split-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
}
.split-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
}
.split-value {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text);
  min-width: 36px;
  text-align: right;
}

.part-btn {
  width: 32px;
  height: 28px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-dim);
  border-radius: 3px;
  -webkit-tap-highlight-color: transparent;
}
.part-btn.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}

@media (max-width: 640px) {
  .perf-bar {
    gap: 10px;
    padding: 6px 10px;
  }
  .split-slider {
    width: 100px;
  }
}
</style>
