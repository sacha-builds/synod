<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Synth } from './audio/Synth'
import { defaultPatch } from './audio/types'
import { cloneSynthPatch, restorePart, restoreSynthPatch } from './audio/randomize'
import {
  generatePresetId,
  loadLastPresetId,
  loadUserPresets,
  parsePresetFile,
  PresetParseError,
  presetFileName,
  saveLastPresetId,
  saveUserPresets,
  serializePreset,
  type SynodPreset,
} from './audio/presets'
import { FACTORY_PRESETS } from './audio/factoryPresets'
import OscillatorPanel from './components/OscillatorPanel.vue'
import EnvelopePanel from './components/EnvelopePanel.vue'
import FilterPanel from './components/FilterPanel.vue'
import Oscilloscope from './components/Oscilloscope.vue'
import KeyboardInput from './components/KeyboardInput.vue'
import Knob from './components/Knob.vue'
import VoicePanel from './components/VoicePanel.vue'
import RandomizePanel from './components/RandomizePanel.vue'
import FXPanel from './components/FXPanel.vue'
import ArpPanel from './components/ArpPanel.vue'
import PresetBar from './components/PresetBar.vue'
import PerformanceBar from './components/PerformanceBar.vue'
import { Arp } from './audio/Arp'
import { useMidi } from './composables/useMidi'

const patch = reactive(defaultPatch())
const synth = shallowRef<Synth | null>(null)
const arp = shallowRef<Arp | null>(null)
const started = ref(false)

/** Notes currently sounding (from any source) — what the keyboard highlights. */
const activeNotes = reactive(new Set<number>())
/** Keys the user is physically holding down — used to detect "all released"
 *  transitions when the arp is in latch mode. */
const physicalHeld = reactive(new Set<number>())

/** Index within the arp's pattern that's currently playing, for the step
 *  indicator in the pattern editor. -1 when arp isn't playing. */
const arpCurrentStep = ref(-1)

// --- Preset management ---
const userPresets = ref<SynodPreset[]>(loadUserPresets())
const currentPresetId = ref<string | null>(null)
/** Per-part "last loaded preset" pointer. In Single mode only [0] matters;
 *  in bitimbral modes each side is tracked independently so the preset bar
 *  can show "Name A | Name B". */
const partPresetIds = ref<[string | null, string | null]>([null, null])
const isDirty = ref(false)
/** Block the dirty-detector briefly after loading a preset so the restore
 *  itself doesn't flag the patch as dirty. */
let suppressDirty = true

const allPresets = computed(() => [...FACTORY_PRESETS, ...userPresets.value])
const presetListItems = computed(() =>
  allPresets.value.map((p) => ({ id: p.id, name: p.name, builtin: p.builtin })),
)

// Mark the patch dirty when anything changes. deep: true so all nested
// params trigger. A small setTimeout at load time avoids flagging the
// restore itself as a user edit.
watch(
  () => JSON.stringify(patch),
  () => {
    if (!suppressDirty) isDirty.value = true
  },
)

function applyPatch(newPatch: typeof patch): void {
  suppressDirty = true
  // Clean up audio state before loading so no stuck voices carry over.
  synth.value?.allNotesOff()
  arp.value?.clearHeld()
  activeNotes.clear()
  physicalHeld.clear()
  restoreSynthPatch(patch, newPatch)
  // Let the engine re-point at the new nested part patches. Reactivity will
  // still flow thanks to restoreSynthPatch mutating in place, but the Synth
  // holds its own PartPatch references we want to re-bind just in case.
  synth.value?.syncPartPatches()
  // Let the reactive system settle, then re-arm dirty tracking.
  setTimeout(() => {
    suppressDirty = false
  }, 50)
}

/** The part currently being edited in the UI. All per-part panels bind
 *  to this — switching the part selector swaps which PartPatch the
 *  panels mutate. */
const currentPart = computed(() => patch.parts[patch.activePart])

function loadPreset(id: string): void {
  const preset = allPresets.value.find((p) => p.id === id)
  if (!preset) return

  const presetIsDual = preset.patch.bimode !== 'single'
  const currentlyBitimbral = patch.bimode !== 'single'

  if (currentlyBitimbral && !presetIsDual) {
    suppressDirty = true
    const idx = patch.activePart
    synth.value?.parts[idx].releaseAll()
    restorePart(patch.parts[idx], preset.patch.parts[0])
    synth.value?.syncPartPatches()
    setTimeout(() => {
      suppressDirty = false
    }, 50)
    // Only the active part was changed — update its preset pointer, keep
    // the other side's pointer so the preset bar can still show both names.
    partPresetIds.value = idx === 0 ? [preset.id, partPresetIds.value[1]] : [partPresetIds.value[0], preset.id]
    currentPresetId.value = null
    isDirty.value = false
    saveLastPresetId(null)
    return
  }

  // Single mode, or the preset itself is a full dual performance.
  applyPatch(preset.patch)
  currentPresetId.value = preset.id
  // Single-timbre preset: only Part A gets a name. Dual preset: both sides
  // share the same preset id (and name).
  partPresetIds.value = presetIsDual ? [preset.id, preset.id] : [preset.id, null]
  isDirty.value = false
  saveLastPresetId(preset.id)
}

function prevPreset(): void {
  const list = allPresets.value
  if (list.length === 0) return
  const idx = list.findIndex((p) => p.id === currentPresetId.value)
  const prev = list[(idx - 1 + list.length) % list.length]
  loadPreset(prev.id)
}
function nextPreset(): void {
  const list = allPresets.value
  if (list.length === 0) return
  const idx = list.findIndex((p) => p.id === currentPresetId.value)
  const next = list[(idx + 1) % list.length]
  loadPreset(next.id)
}

function savePreset(): void {
  const existing = userPresets.value.find((p) => p.id === currentPresetId.value)
  if (!existing) return
  existing.patch = cloneSynthPatch(patch)
  saveUserPresets(userPresets.value)
  isDirty.value = false
}

function savePresetAs(): void {
  const suggested =
    allPresets.value.find((p) => p.id === currentPresetId.value)?.name ?? 'My Preset'
  const name = window.prompt('Name for this preset:', suggested)
  if (!name) return
  const trimmed = name.trim()
  if (!trimmed) return
  const preset: SynodPreset = {
    id: generatePresetId(),
    name: trimmed,
    patch: cloneSynthPatch(patch),
    createdAt: new Date().toISOString(),
  }
  userPresets.value = [...userPresets.value, preset]
  saveUserPresets(userPresets.value)
  currentPresetId.value = preset.id
  isDirty.value = false
  saveLastPresetId(preset.id)
}

function renamePreset(): void {
  const preset = userPresets.value.find((p) => p.id === currentPresetId.value)
  if (!preset) return
  const name = window.prompt('New name:', preset.name)
  if (!name) return
  const trimmed = name.trim()
  if (!trimmed) return
  preset.name = trimmed
  saveUserPresets(userPresets.value)
}

function deletePreset(): void {
  const preset = userPresets.value.find((p) => p.id === currentPresetId.value)
  if (!preset) return
  if (!window.confirm(`Delete preset "${preset.name}"?`)) return
  userPresets.value = userPresets.value.filter((p) => p.id !== preset.id)
  saveUserPresets(userPresets.value)
  // Fall back to the Init factory preset
  loadPreset(FACTORY_PRESETS[0].id)
}

function exportPreset(): void {
  const preset = allPresets.value.find((p) => p.id === currentPresetId.value)
  if (!preset) return
  // Ensure the exported patch reflects any unsaved edits.
  const snapshot: SynodPreset = { ...preset, patch: cloneSynthPatch(patch) }
  const json = serializePreset(snapshot)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = presetFileName(snapshot)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function importPreset(file: File): Promise<void> {
  try {
    const text = await file.text()
    const parsed = parsePresetFile(text)
    const preset: SynodPreset = {
      id: generatePresetId(),
      name: parsed.name,
      author: parsed.author,
      patch: parsed.patch,
      createdAt: parsed.createdAt,
    }
    userPresets.value = [...userPresets.value, preset]
    saveUserPresets(userPresets.value)
    loadPreset(preset.id)
  } catch (e) {
    const msg = e instanceof PresetParseError ? e.message : 'Failed to import preset'
    window.alert(`Import failed: ${msg}`)
  }
}

// Initial load: last-used preset, or the first factory preset.
{
  const lastId = loadLastPresetId()
  const start =
    (lastId && allPresets.value.find((p) => p.id === lastId)) || FACTORY_PRESETS[0]
  // Apply the patch but don't treat this as a user edit.
  applyPatch(start.patch)
  currentPresetId.value = start.id
  const startIsDual = start.patch.bimode !== 'single'
  partPresetIds.value = startIsDual ? [start.id, start.id] : [start.id, null]
}

/** Resolve the display name for a given part's last-loaded preset. */
function partPresetName(idx: 0 | 1): string {
  const id = partPresetIds.value[idx]
  if (!id) return 'Untitled'
  return allPresets.value.find((p) => p.id === id)?.name ?? 'Untitled'
}

/** Equal-truncate both names so the combined "A | B" string fits a target
 *  length. Each side gets the same budget; names under budget aren't touched. */
function truncateEqual(a: string, b: string, totalBudget: number): [string, string] {
  const sep = ' | '
  if (a.length + sep.length + b.length <= totalBudget) return [a, b]
  const perSide = Math.max(4, Math.floor((totalBudget - sep.length) / 2))
  const clip = (s: string) => (s.length <= perSide ? s : s.slice(0, perSide - 1) + '…')
  return [clip(a), clip(b)]
}

const presetDisplayName = computed(() => {
  if (patch.bimode === 'single') {
    return partPresetName(0)
  }
  const [a, b] = truncateEqual(partPresetName(0), partPresetName(1), 28)
  return `${a} | ${b}`
})

/** Create (if needed) and resume the synth synchronously from a user gesture.
 *  Must stay synchronous — iOS Safari drops the gesture across awaits. */
function start(): void {
  if (!synth.value) {
    const s = new Synth(patch)
    synth.value = s
    // Arp drives the synth directly via its callbacks.
    arp.value = new Arp(s.ctx, patch.arp, {
      noteOn: (note, velocity) => {
        if (!synth.value) return
        activeNotes.add(note)
        synth.value.noteOn(note, velocity)
      },
      noteOff: (note) => {
        activeNotes.delete(note)
        synth.value?.noteOff(note)
      },
      onStep: (patternIdx) => {
        arpCurrentStep.value = patternIdx
      },
    })
  }
  synth.value.resume()
  started.value = true
}

/** Note-on from any source (physical input: MIDI, QWERTY, click). */
function startNote(note: number, velocity: number) {
  if (physicalHeld.has(note)) return
  physicalHeld.add(note)
  if (!synth.value) start()
  if (patch.arp.enabled && arp.value) {
    arp.value.addHeldNote(note, velocity)
  } else {
    if (!activeNotes.has(note)) activeNotes.add(note)
    synth.value!.noteOn(note, velocity)
  }
}
function stopNote(note: number) {
  physicalHeld.delete(note)
  if (patch.arp.enabled && arp.value) {
    if (patch.arp.latch) {
      // Keep in the arp's held chord; if all physical keys are now released,
      // mark that the next press starts a fresh chord.
      if (physicalHeld.size === 0) arp.value.markLatchReset()
    } else {
      arp.value.removeHeldNote(note)
    }
  } else {
    activeNotes.delete(note)
    synth.value?.noteOff(note)
  }
}

/** Gently release every held note. Used when the window loses focus — key-up
 *  events stop firing during blur, so without this, any QWERTY-held notes
 *  would sustain indefinitely. */
function releaseAll() {
  physicalHeld.clear()
  arp.value?.clearHeld()
  if (activeNotes.size === 0) return
  activeNotes.clear()
  synth.value?.allNotesOff()
}

function panic(e: Event) {
  synth.value?.panic()
  arp.value?.clearHeld()
  activeNotes.clear()
  physicalHeld.clear()
  // Blur after click so mobile doesn't keep the button in :hover/:focus state.
  ;(e.currentTarget as HTMLElement)?.blur?.()
}

/** Load a fresh default patch and un-select any current preset — so the
 *  user's current preset stays untouched and edits here won't save back
 *  over it. */
function initPatch(e: Event) {
  applyPatch(defaultPatch())
  currentPresetId.value = null
  isDirty.value = false
  saveLastPresetId(null)
  ;(e.currentTarget as HTMLElement)?.blur?.()
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

// When we drop back to Single, only Part A is audible. Force the UI to
// edit Part A too — otherwise the user is adjusting a part they can't hear.
// Part B's patch data is preserved untouched, so switching back to Layer /
// Split restores exactly what was there.
watch(
  () => patch.bimode,
  (mode) => {
    if (mode === 'single' && patch.activePart !== 0) {
      patch.activePart = 0
    }
  },
)

// Per-part watches — the same cheap live-updates apply to each part.
// Watch each side individually so switching activePart doesn't fire a
// stale update on the part that didn't actually change.
for (const partIdx of [0, 1] as const) {
  watch(
    () => patch.parts[partIdx].filter.type,
    (t) => synth.value?.setPartFilterType(partIdx, t, 1),
  )
  watch(
    () => patch.parts[partIdx].filter2.type,
    (t) => synth.value?.setPartFilterType(partIdx, t, 2),
  )
  watch(
    () => patch.parts[partIdx].voiceMode,
    (m) => synth.value?.setPartVoiceMode(partIdx, m),
  )
  watch(
    () => patch.parts[partIdx].level,
    (v) => synth.value?.setPartLevel(partIdx, v),
  )
  watch(
    [
      () => patch.parts[partIdx].ampEnvelope.release,
      () => patch.parts[partIdx].filterEnvelope.release,
    ],
    () => synth.value?.parts[partIdx].rescheduleReleases(),
  )
}

/** Run a synth method inside a try/catch so a single bad call can't crash
 *  Vue and unmount the UI. Logs to console instead. Useful during
 *  development when class methods might be out of sync after an HMR cycle. */
function safe<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn()
  } catch (err) {
    console.error(`[synod] ${label} threw:`, err)
    return undefined
  }
}

// Arp enable toggle: when turning off, release any currently-held/playing
// arp notes. When turning off latch, also release. (Arp tracks its own patch
// reference so the other param changes — rate, BPM, mode — take effect on
// the next scheduled step automatically.)
watch(
  () => patch.arp.enabled,
  (v) => {
    if (!v) {
      arp.value?.shutdown()
      arpCurrentStep.value = -1
    }
  },
)
watch(
  () => patch.arp.latch,
  (v) => {
    // If latch is turned off while some notes were sticky, release them
    // unless the user still has them physically held.
    if (!v && arp.value) {
      // Re-sync held chord to only currently-physical keys
      arp.value.clearHeld()
      if (patch.arp.enabled) {
        for (const n of physicalHeld) arp.value.addHeldNote(n, 100)
      }
    }
  },
)

// FX — live-update reverb + delay on every param change.
watch(() => patch.fx.reverb.enabled, (v) => safe('setReverbEnabled', () => synth.value?.setReverbEnabled(v)))
watch(() => patch.fx.reverb.mix, (v) => safe('setReverbMix', () => synth.value?.setReverbMix(v)))
watch(() => patch.fx.reverb.decay, (v) => safe('setReverbDecay', () => synth.value?.setReverbDecay(v)))
watch(() => patch.fx.delay.enabled, (v) => safe('setDelayEnabled', () => synth.value?.setDelayEnabled(v)))
watch(() => patch.fx.delay.mix, (v) => safe('setDelayMix', () => synth.value?.setDelayMix(v)))
watch(() => patch.fx.delay.time, (v) => safe('setDelayTime', () => synth.value?.setDelayTime(v)))
watch(() => patch.fx.delay.feedback, (v) => safe('setDelayFeedback', () => synth.value?.setDelayFeedback(v)))

// --- Mobile sound hint ---
// Browsers can't read the hardware mute switch or system volume. The best we
// can do is show a proactive dismissible hint on first audio unlock for
// mobile users — iOS gets a mute-switch-specific message since that's the
// most common "why is there no sound?" cause.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
const isMobile = isIOS || navigator.maxTouchPoints > 0 || 'ontouchstart' in window
const showSoundHint = ref(false)
let soundHintTimer: number | null = null

function dismissSoundHint() {
  showSoundHint.value = false
  try {
    localStorage.setItem('synod:soundHintDismissed', '1')
  } catch {
    /* private-mode / quota */
  }
  if (soundHintTimer !== null) {
    clearTimeout(soundHintTimer)
    soundHintTimer = null
  }
}

watch(started, (v) => {
  if (!v || !isMobile) return
  let dismissed = false
  try {
    dismissed = localStorage.getItem('synod:soundHintDismissed') === '1'
  } catch {
    /* ignore */
  }
  if (dismissed) return
  showSoundHint.value = true
  soundHintTimer = window.setTimeout(() => {
    showSoundHint.value = false
  }, 10000)
})

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

// --- Scroll-fade indicator for the module area ---
const layoutRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

function updateScroll() {
  const el = layoutRef.value
  if (!el) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }
  canScrollUp.value = el.scrollTop > 2
  canScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 2
}

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null
onMounted(() => {
  const el = layoutRef.value
  if (!el) return
  updateScroll()
  ro = new ResizeObserver(updateScroll)
  ro.observe(el)
  mo = new MutationObserver(updateScroll)
  mo.observe(el, { childList: true, subtree: true, attributes: true })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  mo?.disconnect()
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
        <button class="init" @click="initPatch($event)" title="Reset all controls to default">
          INIT
        </button>
        <button class="panic" @click="panic($event)" title="Cut all sound immediately">
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

    <PresetBar
      :presets="presetListItems"
      :current-id="currentPresetId"
      :display-name="presetDisplayName"
      :is-dirty="isDirty"
      @load="loadPreset"
      @prev="prevPreset"
      @next="nextPreset"
      @save="savePreset"
      @save-as="savePresetAs"
      @rename="renamePreset"
      @remove="deletePreset"
      @export-preset="exportPreset"
      @import-preset="importPreset"
    />

    <PerformanceBar :patch="patch" />

    <transition name="hint">
      <div v-if="showSoundHint" class="sound-hint" role="status">
        <span class="hint-icon">🔊</span>
        <span class="hint-text">
          <template v-if="isIOS">
            No sound? Check the mute switch on the side of your iPhone, and your volume.
          </template>
          <template v-else>
            No sound? Check your volume level.
          </template>
        </span>
        <button class="hint-close" @click="dismissSoundHint" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <div class="layout-wrap" :class="{ 'fade-up': canScrollUp, 'fade-down': canScrollDown }">
      <main class="layout" ref="layoutRef" @scroll="updateScroll">
        <section class="randomize-section">
          <RandomizePanel :part="currentPart" :part-label="patch.activePart === 0 ? 'A' : 'B'" />
        </section>

        <details class="oscillators panel" open>
          <summary class="panel-title">
            <span class="chevron">▼</span>
            Oscillators
          </summary>
          <div class="osc-grid">
            <OscillatorPanel :index="0" :osc="currentPart.oscillators[0]" />
            <OscillatorPanel :index="1" :osc="currentPart.oscillators[1]" />
            <OscillatorPanel :index="2" :osc="currentPart.oscillators[2]" />
          </div>
        </details>

        <section class="scope-section">
          <Oscilloscope :analyser="synth?.analyser ?? null" />
        </section>

        <section class="ampenv-section">
          <EnvelopePanel title="Amp Envelope" :env="currentPart.ampEnvelope" />
        </section>

        <section class="filtenv-section">
          <EnvelopePanel title="Filter Envelope" :env="currentPart.filterEnvelope" />
        </section>

        <section class="filter-section">
          <FilterPanel title="Filter 1" :filter="currentPart.filter" />
          <div class="routing-bar" :class="{ muted: !currentPart.filter2.enabled }">
            <span class="routing-label">ROUTING</span>
            <button
              class="routing-btn"
              :class="{ active: currentPart.filterRouting === 'series' }"
              @click="currentPart.filterRouting = 'series'"
              :disabled="!currentPart.filter2.enabled"
            >
              SERIES
            </button>
            <button
              class="routing-btn"
              :class="{ active: currentPart.filterRouting === 'parallel' }"
              @click="currentPart.filterRouting = 'parallel'"
              :disabled="!currentPart.filter2.enabled"
            >
              PARALLEL
            </button>
          </div>
        </section>

        <section class="filter2-section">
          <FilterPanel title="Filter 2" :filter="currentPart.filter2" show-enable />
        </section>

        <section class="voice-section">
          <VoicePanel :part="currentPart" />
        </section>

        <section class="arp-section">
          <ArpPanel :patch="patch" :current-step="arpCurrentStep" />
        </section>

        <section class="fx-section">
          <FXPanel :patch="patch" />
        </section>
      </main>
    </div>

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
  gap: 10px;
}
.init {
  padding: 7px 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--text-dim);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  transition: all 100ms var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .init:hover {
    color: var(--text);
    border-color: var(--line-hi);
  }
}
.init:active {
  transform: scale(0.97);
  color: var(--text);
  border-color: var(--line-hi);
}
.init:focus { outline: none; }
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
  -webkit-tap-highlight-color: transparent;
}
/* Only apply hover styles on devices that actually have a hover pointer —
   prevents iOS from keeping the "lit" state after a tap since it treats a
   tapped element as hovered until you tap elsewhere. */
@media (hover: hover) {
  .panic:hover {
    color: #fff;
    background: var(--danger);
    border-color: var(--danger);
    box-shadow: 0 0 10px rgba(217, 83, 79, 0.5);
  }
}
.panic:active {
  color: #fff;
  background: var(--danger);
  border-color: var(--danger);
  box-shadow: 0 0 10px rgba(217, 83, 79, 0.5);
  transform: scale(0.97);
}
.panic:focus { outline: none; }
.panic:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
.sound-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  margin: 8px 12px 0 12px;
  background: var(--bg-2);
  border: 1px solid var(--accent-dim);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.3;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}
.hint-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.hint-text {
  flex: 1;
}
.hint-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.hint-close:hover {
  color: var(--text);
}
.hint-enter-active,
.hint-leave-active {
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.layout-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}
.layout-wrap::before,
.layout-wrap::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 22px;
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transition: opacity 180ms var(--ease-out);
}
.layout-wrap::before {
  top: 0;
  background: linear-gradient(180deg, var(--bg-0) 0%, transparent 100%);
}
.layout-wrap::after {
  bottom: 0;
  background: linear-gradient(0deg, var(--bg-0) 0%, transparent 100%);
}
.layout-wrap.fade-up::before {
  opacity: 1;
}
.layout-wrap.fade-down::after {
  opacity: 1;
}

.layout {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  gap: 12px;
  padding: 12px;
  grid-template-columns: 1fr;
  grid-template-areas:
    'osc'
    'scope'
    'ampenv'
    'filtenv'
    'filter'
    'voice';
}
/* Mobile: oscilloscope first so users see motion/feedback before the controls */
@media (max-width: 899px) {
  .layout {
    grid-template-areas:
      'scope'
      'osc'
      'voice'
      'ampenv'
      'filtenv'
      'filter'
      'filter2'
      'arp'
      'fx'
      'rand';
  }
}
@media (min-width: 900px) {
  .layout {
    grid-template-columns: 1.35fr 1fr;
    grid-template-areas:
      'osc    scope'
      'osc    voice'
      'ampenv filtenv'
      'filter filter2'
      'arp    arp'
      'fx     fx'
      'rand   rand';
  }
}
.randomize-section {
  grid-area: rand;
}
.fx-section {
  grid-area: fx;
}
.arp-section {
  grid-area: arp;
}
.oscillators {
  grid-area: osc;
}
.osc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}
.scope-section {
  grid-area: scope;
}
.ampenv-section {
  grid-area: ampenv;
}
.filtenv-section {
  grid-area: filtenv;
}
.filter-section {
  grid-area: filter;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.filter2-section {
  grid-area: filter2;
}
.routing-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
  transition: opacity 120ms;
}
.routing-bar.muted {
  opacity: 0.45;
}
.routing-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-faint);
  margin-right: auto;
}
.routing-btn {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  padding: 5px 10px;
  color: var(--text-dim);
  border-radius: 3px;
}
.routing-btn.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}
.routing-btn:disabled {
  cursor: not-allowed;
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

/* Mobile: tighter layout + topbar compaction */
@media (max-width: 640px) {
  .layout {
    gap: 8px;
    padding: 8px;
  }
  .env-row {
    gap: 8px;
  }
  .osc-grid {
    /* 3 oscillators never fit side-by-side on phone; stack cleanly */
    grid-template-columns: 1fr;
    gap: 6px;
  }
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
    gap: 12px;
  }
  .panic {
    padding: 6px 10px;
    font-size: 9px;
    letter-spacing: 0.12em;
  }
  .master {
    min-width: 48px;
  }
  .kbd-footer {
    padding: 6px 8px;
    padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
  }
  .brand .name {
    font-size: 12px;
  }
}
</style>
