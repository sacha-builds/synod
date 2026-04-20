<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SeqPatch } from '../audio/types'
import { ARP_RATES } from '../audio/Arp'
import Knob from './Knob.vue'

const props = defineProps<{
  seq: SeqPatch
  isPlaying: boolean
  currentStep: number
}>()

const emit = defineEmits<{
  play: []
  stop: []
  /** Request that the on-screen keyboard's next note input assigns to this step. */
  armStep: [stepIndex: number | null]
}>()

const armedStep = ref<number | null>(null)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function noteName(midi: number): string {
  const o = Math.floor(midi / 12) - 1
  return NOTE_NAMES[midi % 12] + o
}

function toggleStep(i: number) {
  props.seq.steps[i].active = !props.seq.steps[i].active
}

function shiftNote(i: number, delta: number) {
  const s = props.seq.steps[i]
  s.note = Math.max(0, Math.min(127, s.note + delta))
}

function armForKeyboard(i: number) {
  if (armedStep.value === i) {
    armedStep.value = null
    emit('armStep', null)
  } else {
    armedStep.value = i
    emit('armStep', i)
  }
}

function setLength(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  props.seq.length = Math.max(1, Math.min(16, v))
}

function setVelocity(i: number, e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  props.seq.steps[i].velocity = Math.max(1, Math.min(127, v))
}

const visibleSteps = computed(() =>
  props.seq.steps.slice(0, 16).map((s, i) => ({
    idx: i,
    step: s,
    inCycle: i < props.seq.length,
    current: props.isPlaying && props.currentStep === i,
    armed: armedStep.value === i,
  })),
)
</script>

<template>
  <details class="panel seq-panel" :class="{ disabled: !seq.enabled }" open>
    <summary class="panel-title">
      <span class="chevron">▼</span>
      Sequencer
      <label class="enable-toggle" @click.stop>
        <input type="checkbox" v-model="seq.enabled" />
        <span class="enable-pill" :class="{ on: seq.enabled }">{{ seq.enabled ? 'ON' : 'OFF' }}</span>
      </label>
    </summary>

    <div class="body" :class="{ dimmed: !seq.enabled }">
      <div class="transport-row">
        <button
          class="play-btn"
          :class="{ playing: isPlaying }"
          @click="isPlaying ? emit('stop') : emit('play')"
          :title="isPlaying ? 'Stop' : 'Play'"
        >
          <span v-if="!isPlaying" class="triangle" />
          <span v-else class="square" />
          {{ isPlaying ? 'STOP' : 'PLAY' }}
        </button>

        <div class="rate-group">
          <span class="sub-label">RATE</span>
          <div class="rate-row">
            <button
              v-for="r in ARP_RATES"
              :key="r.id"
              class="rate-btn"
              :class="{ active: seq.rate === r.id }"
              @click="seq.rate = r.id"
            >
              {{ r.label }}
            </button>
          </div>
        </div>

        <Knob
          :model-value="seq.bpm"
          @update:model-value="seq.bpm = Math.round($event)"
          :min="30"
          :max="240"
          :step="1"
          label="BPM"
          :format="(v) => v.toFixed(0)"
        />

        <div class="length-field">
          <span class="sub-label">LEN</span>
          <input
            type="range"
            :value="seq.length"
            min="1"
            max="16"
            step="1"
            class="length-slider"
            @input="setLength"
          />
          <span class="length-value">{{ seq.length }}</span>
        </div>
      </div>

      <div class="grid-scroll">
        <div class="grid" :style="{ '--step-count': 16 }">
          <div
            v-for="s in visibleSteps"
            :key="s.idx"
            class="cell"
            :class="{
              active: s.step.active,
              current: s.current,
              outcycle: !s.inCycle,
              armed: s.armed,
            }"
          >
            <div class="note-row">
              <button
                class="note-btn"
                @click="armForKeyboard(s.idx)"
                :title="s.armed ? 'Armed — play a key to assign pitch' : 'Click, then play a key to set pitch'"
              >
                {{ noteName(s.step.note) }}
              </button>
              <div class="nudges">
                <button class="nudge" @click="shiftNote(s.idx, 1)" title="Semitone up">▲</button>
                <button class="nudge" @click="shiftNote(s.idx, -1)" title="Semitone down">▼</button>
              </div>
            </div>

            <button
              class="bar-btn"
              @click="toggleStep(s.idx)"
              :title="s.step.active ? 'Active — click to rest' : 'Rest — click to activate'"
            >
              <span class="bar-fill" :style="{ height: (s.step.velocity / 127) * 100 + '%' }" />
            </button>

            <input
              type="range"
              :value="s.step.velocity"
              min="1"
              max="127"
              step="1"
              class="vel-slider"
              @input="setVelocity(s.idx, $event)"
              @click.stop
              title="Velocity"
            />

            <span class="step-label">{{ s.idx + 1 }}</span>
          </div>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
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

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.body.dimmed {
  opacity: 0.45;
  pointer-events: none;
}

.transport-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.play-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--text-dim);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
}
.play-btn .triangle {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid currentColor;
}
.play-btn .square {
  width: 9px;
  height: 9px;
  background: currentColor;
}
.play-btn.playing {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-dim);
}

.sub-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}

.rate-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rate-row {
  display: flex;
  gap: 2px;
}
.rate-btn {
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

.length-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 140px;
}
.length-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--bg-2);
  border-radius: 2px;
  flex: 1;
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
}
.grid {
  display: grid;
  grid-template-columns: repeat(var(--step-count), minmax(48px, 1fr));
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
  transition: border-color 120ms, background 120ms;
}
.cell.outcycle {
  opacity: 0.28;
}
.cell.current {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-dim);
}
.cell.armed {
  border-color: var(--cool);
  box-shadow: 0 0 6px var(--cool);
}

.note-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
}
.note-btn {
  flex: 1;
  padding: 4px 2px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: var(--text);
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: pointer;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}
.cell.armed .note-btn {
  color: var(--cool);
}
.nudges {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.nudge {
  width: 14px;
  height: 12px;
  padding: 0;
  font-size: 7px;
  line-height: 1;
  color: var(--text-faint);
  background: transparent;
  border: none;
  border-left: 1px solid var(--line);
  border-radius: 0;
  cursor: pointer;
}
.nudge:first-child {
  border-bottom: 1px solid var(--line);
}

.bar-btn {
  flex: 1;
  position: relative;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
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
  transition: height 80ms var(--ease-out), background 120ms;
}
.cell.active .bar-fill {
  background: var(--accent);
}

.vel-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  margin: 4px 0 2px 0;
  background: var(--bg-1);
  border: none;
  border-radius: 1px;
}
.vel-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-dim);
  cursor: pointer;
}
.vel-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-dim);
  cursor: pointer;
}

.step-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-faint);
  text-align: center;
  padding: 2px 0;
}
</style>
