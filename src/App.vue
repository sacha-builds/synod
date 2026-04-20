<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Synth } from './audio/Synth'
import { defaultPatch } from './audio/types'
import OscillatorPanel from './components/OscillatorPanel.vue'
import EnvelopePanel from './components/EnvelopePanel.vue'
import FilterPanel from './components/FilterPanel.vue'
import Oscilloscope from './components/Oscilloscope.vue'
import KeyboardInput from './components/KeyboardInput.vue'
import Knob from './components/Knob.vue'

const patch = reactive(defaultPatch())
const synth = shallowRef<Synth | null>(null)
const started = ref(false)

async function start() {
  if (synth.value) {
    await synth.value.resume()
    started.value = true
    return
  }
  const s = new Synth(patch)
  await s.resume()
  synth.value = s
  started.value = true
}

function onNoteOn(note: number, velocity: number) {
  if (!synth.value) return
  synth.value.noteOn(note, velocity)
}
function onNoteOff(note: number) {
  synth.value?.noteOff(note)
}

// Keep master gain in sync
watch(
  () => patch.masterGain,
  (v) => synth.value?.setMasterGain(v),
)

onMounted(() => {
  // Unlock audio on any user gesture
  const handler = () => {
    if (!started.value) start()
  }
  window.addEventListener('pointerdown', handler, { once: true })
  window.addEventListener('keydown', handler, { once: true })
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
      <div class="status">
        <span class="dot" :class="{ on: started }" />
        <span>{{ started ? 'AUDIO READY' : 'CLICK OR PRESS ANY KEY' }}</span>
      </div>
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

      <section class="kbd-section panel">
        <h3 class="panel-title">Keyboard</h3>
        <KeyboardInput @note-on="onNoteOn" @note-off="onNoteOff" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
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
.status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  transition: background 200ms;
}
.status .dot.on {
  background: var(--cool);
  box-shadow: 0 0 6px var(--cool);
}
.master {
  min-width: 60px;
  display: flex;
  justify-content: flex-end;
}
.layout {
  flex: 1;
  overflow: auto;
  display: grid;
  gap: 12px;
  padding: 12px;
  grid-template-columns: 1fr;
  grid-template-areas:
    'scope'
    'osc'
    'filter'
    'env'
    'kbd';
}
@media (min-width: 980px) {
  .layout {
    grid-template-columns: 1.3fr 1fr;
    grid-template-areas:
      'scope scope'
      'osc env'
      'filter env'
      'kbd kbd';
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
.kbd-section {
  grid-area: kbd;
}
</style>
