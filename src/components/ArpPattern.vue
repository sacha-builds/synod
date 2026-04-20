<script setup lang="ts">
import { computed } from 'vue'
import type { ArpPatch } from '../audio/types'

const props = defineProps<{
  arp: ArpPatch
  /** Index within the pattern that's currently playing (0..patternLength-1), or -1 if arp is idle. */
  currentStep: number
}>()

const OCTAVE_CYCLE = [0, 1, 2, -1, -2] as const

function toggleActive(i: number): void {
  const s = props.arp.pattern[i]
  s.active = !s.active
}

function cycleOctave(i: number): void {
  const s = props.arp.pattern[i]
  const idx = OCTAVE_CYCLE.indexOf(s.octave as (typeof OCTAVE_CYCLE)[number])
  const next = OCTAVE_CYCLE[(idx + 1) % OCTAVE_CYCLE.length]
  s.octave = next
}

function toggleAccent(i: number): void {
  const s = props.arp.pattern[i]
  // Cycle velocity: normal (1.0) → accent (1.3) → soft (0.6) → normal
  if (s.velocityMul === 1) s.velocityMul = 1.3
  else if (s.velocityMul > 1) s.velocityMul = 0.6
  else s.velocityMul = 1
}

function octaveLabel(oct: number): string {
  if (oct === 0) return ''
  return oct > 0 ? '+' + oct : String(oct)
}

const visibleSteps = computed(() => {
  const total = Math.max(1, Math.min(16, props.arp.patternLength))
  const out: { idx: number; active: boolean; octave: number; accent: boolean; soft: boolean; current: boolean }[] = []
  for (let i = 0; i < total; i++) {
    const s = props.arp.pattern[i]
    out.push({
      idx: i,
      active: s.active,
      octave: s.octave,
      accent: s.velocityMul > 1,
      soft: s.velocityMul < 1,
      current: props.currentStep === i,
    })
  }
  return out
})

function setLength(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  props.arp.patternLength = Math.max(1, Math.min(16, v))
}
</script>

<template>
  <div class="pattern">
    <div class="header">
      <label class="phrase-toggle" @click.stop>
        <input type="checkbox" v-model="arp.usePattern" />
        <span class="phrase-pill" :class="{ on: arp.usePattern }">
          {{ arp.usePattern ? 'PHRASE ON' : 'PHRASE OFF' }}
        </span>
      </label>
      <div class="length-field">
        <span class="mini-label">LEN</span>
        <input
          type="range"
          :value="arp.patternLength"
          @input="setLength($event)"
          min="1"
          max="16"
          step="1"
          class="length-slider"
        />
        <span class="length-value">{{ arp.patternLength }}</span>
      </div>
    </div>

    <div class="grid-scroll" :class="{ dimmed: !arp.usePattern }">
      <div class="grid" :style="{ '--step-count': visibleSteps.length }">
        <div
          v-for="s in visibleSteps"
          :key="s.idx"
          class="cell"
          :class="{
            active: s.active,
            accent: s.accent,
            soft: s.soft,
            current: s.current && arp.usePattern,
          }"
        >
          <button
            class="oct-btn"
            @click="cycleOctave(s.idx)"
            :title="`Octave offset: ${s.octave}`"
            :class="{ hasOct: s.octave !== 0 }"
          >
            {{ octaveLabel(s.octave) || '·' }}
          </button>
          <button
            class="bar-btn"
            @click="toggleActive(s.idx)"
            :title="s.active ? 'Active — click to rest' : 'Rest — click to activate'"
          >
            <span class="bar-fill" />
          </button>
          <button
            class="accent-btn"
            @click="toggleAccent(s.idx)"
            :title="s.accent ? 'Accent (louder)' : s.soft ? 'Soft (quieter)' : 'Normal velocity — click to cycle'"
          >
            {{ s.accent ? '▲' : s.soft ? '▽' : '·' }}
          </button>
          <span class="step-label">{{ s.idx + 1 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pattern {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid var(--line);
}
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.phrase-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  position: relative;
}
.phrase-toggle input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  margin: 0;
}
.phrase-pill {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--bg-2);
  color: var(--text-faint);
  border: 1px solid var(--line);
  transition: all 120ms var(--ease-out);
}
.phrase-pill.on {
  background: var(--accent-dim);
  color: var(--accent-hi);
  border-color: var(--accent);
}
.length-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 140px;
}
.mini-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}
.length-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--bg-2);
  border-radius: 2px;
  flex: 1;
  min-width: 80px;
}
.length-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
}
.length-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--accent-hi);
  cursor: pointer;
}
.length-value {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text);
  min-width: 18px;
  text-align: right;
}

.grid-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  transition: opacity 120ms;
}
.grid-scroll.dimmed {
  opacity: 0.45;
}
.grid {
  display: grid;
  grid-template-columns: repeat(var(--step-count), minmax(38px, 1fr));
  gap: 4px;
  min-width: max-content;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  overflow: hidden;
  min-width: 38px;
  transition: border-color 120ms, background 120ms;
}
.cell.current {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-dim);
}

.oct-btn,
.accent-btn {
  background: transparent;
  border: none;
  padding: 3px 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-faint);
  cursor: pointer;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
.oct-btn {
  border-bottom: 1px solid var(--line);
}
.oct-btn.hasOct {
  color: var(--accent-hi);
}
.accent-btn {
  border-top: 1px solid var(--line);
  font-size: 11px;
}
.cell.accent .accent-btn {
  color: var(--accent-hi);
}
.cell.soft .accent-btn {
  color: var(--cool);
}

.bar-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
}
.bar-fill {
  display: block;
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 4px;
  height: 0;
  background: var(--text-faint);
  border-radius: 2px;
  transition: height 100ms var(--ease-out), background 120ms;
}
.cell.active .bar-fill {
  height: calc(100% - 8px);
  background: var(--accent);
}
.cell.active.accent .bar-fill {
  background: var(--accent-hi);
  box-shadow: 0 0 4px var(--accent);
}
.cell.active.soft .bar-fill {
  background: var(--accent-dim);
  height: calc(60% - 8px);
}

.step-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-faint);
  text-align: center;
  padding: 2px 0;
}

@media (max-width: 640px) {
  .cell {
    min-width: 34px;
  }
  .grid {
    grid-template-columns: repeat(var(--step-count), minmax(34px, 1fr));
  }
}
</style>
