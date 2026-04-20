<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Synth } from './audio/Synth'
import { defaultPatch } from './audio/types'
import OscillatorPanel from './components/OscillatorPanel.vue'
import EnvelopePanel from './components/EnvelopePanel.vue'
import FilterPanel from './components/FilterPanel.vue'
import Oscilloscope from './components/Oscilloscope.vue'
import KeyboardInput from './components/KeyboardInput.vue'
import Knob from './components/Knob.vue'
import VoicePanel from './components/VoicePanel.vue'
import { useMidi } from './composables/useMidi'

const patch = reactive(defaultPatch())
const synth = shallowRef<Synth | null>(null)
const started = ref(false)

/** All currently-held notes, across all input sources (MIDI, QWERTY, click). */
const activeNotes = reactive(new Set<number>())

/** Create (if needed) and resume the synth synchronously from a user gesture.
 *  Must stay synchronous — iOS Safari drops the gesture across awaits. */
function start(): void {
  if (!synth.value) synth.value = new Synth(patch)
  synth.value.resume()
  started.value = true
}

/** Note-on from any source. Dedups so repeat triggers from different sources
 *  don't stack voices. */
function startNote(note: number, velocity: number) {
  if (activeNotes.has(note)) return
  activeNotes.add(note)
  if (!synth.value) start()
  synth.value!.noteOn(note, velocity)
}
function stopNote(note: number) {
  // Don't guard on activeNotes.has — always propagate noteOff in case the two
  // drifted out of sync (lost MIDI message, focus loss mid-note, etc). The
  // synth is already idempotent on unknown notes.
  activeNotes.delete(note)
  synth.value?.noteOff(note)
}

/** Gently release every held note. Used when the window loses focus — key-up
 *  events stop firing during blur, so without this, any QWERTY-held notes
 *  would sustain indefinitely. */
function releaseAll() {
  if (activeNotes.size === 0) return
  activeNotes.clear()
  synth.value?.allNotesOff()
}

function panic() {
  synth.value?.panic()
  activeNotes.clear()
}

const midi = useMidi({
  noteOn: (note, velocity) => startNote(note, velocity),
  noteOff: (note) => stopNote(note),
})

const midiBlink = ref(false)
watch(
  () => midi.lastMessageAt.value,
  () => {
    midiBlink.value = true
    setTimeout(() => (midiBlink.value = false), 80)
  },
)

const midiLabel = computed(() => {
  if (midi.status.value === 'unsupported') return 'MIDI UNSUPPORTED'
  if (midi.status.value === 'denied') return 'MIDI DENIED'
  if (midi.status.value === 'pending') return 'MIDI…'
  if (midi.inputs.value.length === 0) return 'NO MIDI DEVICE'
  if (midi.inputs.value.length === 1) return midi.inputs.value[0].name.toUpperCase()
  return `${midi.inputs.value.length} MIDI DEVICES`
})

// Keep master gain in sync
watch(
  () => patch.masterGain,
  (v) => synth.value?.setMasterGain(v),
)

// Filter type is cheap to live-update across active voices
watch(
  () => patch.filter.type,
  (t) => synth.value?.setFilterType(t),
)

watch(
  () => patch.voiceMode,
  (m) => synth.value?.setVoiceMode(m),
)

onMounted(() => {
  // Unlock audio on any user gesture
  const handler = () => {
    if (!started.value) start()
  }
  window.addEventListener('pointerdown', handler, { once: true })
  window.addEventListener('keydown', handler, { once: true })

  // Release held notes on blur / tab hide — QWERTY key-up doesn't fire while
  // the window is unfocused, so notes would otherwise sustain forever.
  window.addEventListener('blur', releaseAll)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll()
  })
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">✠</span>
        <span class="name">SYNOD</span>
        <span class="version">v0.0.1</span>
      </div>
      <div class="status-group">
        <div class="status">
          <span class="dot" :class="{ on: started }" />
          <span>{{ started ? 'AUDIO READY' : 'CLICK OR PRESS ANY KEY' }}</span>
        </div>
        <div class="status midi" :title="midi.inputs.value.map((i) => i.name).join(', ')">
          <span
            class="dot"
            :class="{
              on: midi.status.value === 'ready' && midi.inputs.value.length > 0,
              warn: midi.status.value === 'denied' || midi.status.value === 'unsupported',
              blink: midiBlink,
            }"
          />
          <span>{{ midiLabel }}</span>
        </div>
      </div>
      <div class="topbar-right">
        <button class="panic" @click="panic" title="Cut all sound immediately">
          <span class="panic-icon">■</span>
          PANIC
        </button>
        <div class="master">
          <Knob
            v-model="patch.masterGain"
            :min="0"
            :max="1"
            label="MASTER"
            :format="(v) => (v * 100).toFixed(0) + '%'"
            :size="44"
          />
        </div>
      </div>
    </header>

    <main class="layout">
      <section class="scope-section">
        <Oscilloscope :analyser="synth?.analyser ?? null" />
      </section>

      <section class="oscillators panel">
        <h3 class="panel-title">Oscillators</h3>
        <div class="osc-grid">
          <OscillatorPanel :index="0" :osc="patch.oscillators[0]" />
          <OscillatorPanel :index="1" :osc="patch.oscillators[1]" />
          <OscillatorPanel :index="2" :osc="patch.oscillators[2]" />
        </div>
      </section>

      <section class="filter-section">
        <FilterPanel :filter="patch.filter" />
      </section>

      <section class="env-row">
        <EnvelopePanel title="Amp Envelope" :env="patch.ampEnvelope" />
        <EnvelopePanel title="Filter Envelope" :env="patch.filterEnvelope" />
      </section>

      <section class="voice-section">
        <VoicePanel :patch="patch" />
      </section>

    </main>

    <footer class="kbd-footer">
      <KeyboardInput :active-notes="activeNotes" @note-on="startNote" @note-off="stopNote" />
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  /* dynamic viewport unit — accounts for mobile browser chrome appearing/disappearing */
  height: 100dvh;
  background: linear-gradient(180deg, var(--bg-0) 0%, #070708 100%);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.logo {
  color: var(--accent);
  font-size: 18px;
}
.name {
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 13px;
}
.version {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-faint);
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-dim);
}
.status-group {
  display: flex;
  gap: 18px;
  align-items: center;
}
.status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  transition: background 200ms, box-shadow 200ms;
}
.status .dot.on {
  background: var(--cool);
  box-shadow: 0 0 6px var(--cool);
}
.status .dot.warn {
  background: var(--warn);
  box-shadow: 0 0 6px var(--warn);
}
.status .dot.blink {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}
.status.midi {
  cursor: help;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.panic {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #f6b3b0;
  background: #2a1010;
  border: 1px solid #6a2020;
  border-radius: 4px;
  transition: all 100ms var(--ease-out);
}
.panic:hover {
  color: #fff;
  background: var(--danger);
  border-color: var(--danger);
  box-shadow: 0 0 10px rgba(217, 83, 79, 0.5);
}
.panic:active {
  transform: scale(0.97);
}
.panic-icon {
  font-size: 9px;
  line-height: 1;
}
.master {
  min-width: 60px;
  display: flex;
  justify-content: flex-end;
}
.layout {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  gap: 12px;
  padding: 12px;
  grid-template-columns: 1fr;
  grid-template-areas:
    'scope'
    'osc'
    'filter'
    'env'
    'voice';
}
@media (min-width: 980px) {
  .layout {
    grid-template-columns: 1.3fr 1fr;
    grid-template-areas:
      'scope scope'
      'osc env'
      'filter env'
      'voice voice';
  }
}
.scope-section {
  grid-area: scope;
}
.oscillators {
  grid-area: osc;
}
.osc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.filter-section {
  grid-area: filter;
}
.env-row {
  grid-area: env;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.voice-section {
  grid-area: voice;
}

.kbd-footer {
  flex-shrink: 0;
  background: var(--bg-1);
  border-top: 1px solid var(--line);
  padding: 10px 12px;
  /* iPhone home-indicator safe area */
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
}

/* Mobile topbar — wrap + compact */
@media (max-width: 640px) {
  .topbar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
  }
  .version {
    display: none;
  }
  .status-group {
    order: 3;
    width: 100%;
    justify-content: center;
    font-size: 9px;
  }
  .panic {
    padding: 6px 10px;
    font-size: 9px;
  }
}
</style>
