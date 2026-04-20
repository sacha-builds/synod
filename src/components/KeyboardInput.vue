<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  /** Set of MIDI notes currently active (from any source) for visual feedback. */
  activeNotes: Set<number>
}>()

const emit = defineEmits<{
  noteOn: [note: number, velocity: number]
  noteOff: [note: number]
}>()

// QWERTY → chromatic keys, two rows (lower row starts at octave, upper row +1)
const lowerMap: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5,
  KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
}
const upperMap: Record<string, number> = {
  KeyQ: 0, Digit2: 1, KeyW: 2, Digit3: 3, KeyE: 4, KeyR: 5,
  Digit5: 6, KeyT: 7, Digit6: 8, KeyY: 9, Digit7: 10, KeyU: 11,
  KeyI: 12, Digit9: 13, KeyO: 14, Digit0: 15, KeyP: 16,
}

const octave = ref(3)
const OCTAVES = 5 // C3 .. C8 range displayed
const held = new Set<string>() // QWERTY key codes currently held (for repeat suppression)

function noteFor(code: string): number | null {
  if (code in lowerMap) return lowerMap[code] + octave.value * 12
  if (code in upperMap) return upperMap[code] + (octave.value + 1) * 12
  return null
}

// Emit-only helpers — parent owns the active-notes state (so MIDI, QWERTY,
// and click-drag all stay in sync).
function play(note: number) {
  emit('noteOn', note, 100)
}
function stop(note: number) {
  emit('noteOff', note)
}

// --- QWERTY ---
function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return
  if ((e.metaKey || e.ctrlKey) && !['BracketLeft', 'BracketRight'].includes(e.code)) return
  if (e.code === 'BracketLeft') { octave.value = Math.max(0, octave.value - 1); e.preventDefault(); return }
  if (e.code === 'BracketRight') { octave.value = Math.min(7, octave.value + 1); e.preventDefault(); return }
  const note = noteFor(e.code)
  if (note === null || held.has(e.code)) return
  held.add(e.code)
  play(note)
  e.preventDefault()
}
function onKeyUp(e: KeyboardEvent) {
  const note = noteFor(e.code)
  if (note === null) return
  held.delete(e.code)
  stop(note)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

// --- Mouse / touch play ---
// Using pointer events: pointerdown locks mouse-play ON until pointerup.
// When ON, entering a new key triggers noteOff on the old, noteOn on new (glissando).
const mouseDown = ref(false)
const mouseNote = ref<number | null>(null)

function onKeyPointerDown(note: number, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  mouseDown.value = true
  mouseNote.value = note
  play(note)
}
function onKeyPointerEnter(note: number) {
  if (!mouseDown.value) return
  if (mouseNote.value !== null && mouseNote.value !== note) stop(mouseNote.value)
  mouseNote.value = note
  play(note)
}
function onWindowPointerUp() {
  if (!mouseDown.value) return
  mouseDown.value = false
  if (mouseNote.value !== null) stop(mouseNote.value)
  mouseNote.value = null
}

onMounted(() => window.addEventListener('pointerup', onWindowPointerUp))
onBeforeUnmount(() => window.removeEventListener('pointerup', onWindowPointerUp))

// --- Piano layout ---
// Spanning OCTAVES full octaves from `octave` start (C..B × N, plus final C).
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_SET = new Set([1, 3, 6, 8, 10])

interface WhiteKey { note: number; label: string | null }
interface BlackKey { note: number; leftPercent: number }

const whiteKeys = computed<WhiteKey[]>(() => {
  const out: WhiteKey[] = []
  const startNote = octave.value * 12
  const endNote = startNote + OCTAVES * 12
  for (let n = startNote; n <= endNote; n++) {
    const pc = n % 12
    if (BLACK_SET.has(pc)) continue
    const isC = pc === 0
    out.push({ note: n, label: isC ? `C${Math.floor(n / 12) - 1}` : null })
  }
  return out
})

const blackKeys = computed<BlackKey[]>(() => {
  const out: BlackKey[] = []
  const whiteCount = whiteKeys.value.length
  const whiteNotes = whiteKeys.value.map((k) => k.note)
  const startNote = octave.value * 12
  const endNote = startNote + OCTAVES * 12
  for (let n = startNote; n <= endNote; n++) {
    const pc = n % 12
    if (!BLACK_SET.has(pc)) continue
    // Position a black key centered on the boundary between the white key before it and after it.
    const prevWhite = n - 1
    const idx = whiteNotes.indexOf(prevWhite)
    if (idx < 0) continue
    // Each white key occupies (100 / whiteCount)%; black key sits at its right edge.
    const leftPercent = ((idx + 1) / whiteCount) * 100
    out.push({ note: n, leftPercent })
  }
  return out
})

function labelFor(n: number): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}
</script>

<template>
  <div class="kbd">
    <div class="controls">
      <span class="hint">
        <kbd>Z X C</kbd> lower · <kbd>Q W E</kbd> upper · <kbd>[ ]</kbd> octave · click + drag to play
      </span>
      <div class="oct">
        <button @click="octave = Math.max(0, octave - 1)">−</button>
        <span>OCT {{ octave }}</span>
        <button @click="octave = Math.min(7, octave + 1)">+</button>
      </div>
    </div>

    <div class="piano-scroll" @contextmenu.prevent>
      <div
        class="piano"
        :style="{
          '--white-count': whiteKeys.length,
          minWidth: whiteKeys.length * 22 + 'px',
        }"
      >
        <div class="white-row">
          <div
            v-for="k in whiteKeys"
            :key="k.note"
            class="white"
            :class="{ active: props.activeNotes.has(k.note) }"
            :title="labelFor(k.note)"
            @pointerdown="onKeyPointerDown(k.note, $event)"
            @pointerenter="onKeyPointerEnter(k.note)"
          >
            <span v-if="k.label" class="white-label">{{ k.label }}</span>
          </div>
        </div>
        <div class="black-row">
          <div
            v-for="b in blackKeys"
            :key="b.note"
            class="black"
            :class="{ active: props.activeNotes.has(b.note) }"
            :style="{ left: b.leftPercent + '%' }"
            :title="labelFor(b.note)"
            @pointerdown="onKeyPointerDown(b.note, $event)"
            @pointerenter="onKeyPointerEnter(b.note)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kbd {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-dim);
  gap: 12px;
  flex-wrap: wrap;
}
.hint {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}
.hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 3px;
}
.oct {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.oct button {
  padding: 2px 8px;
  font-size: 12px;
  min-width: 24px;
}

.piano-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--line-hi) transparent;
}
.piano-scroll::-webkit-scrollbar {
  height: 6px;
}
.piano-scroll::-webkit-scrollbar-thumb {
  background: var(--line-hi);
  border-radius: 3px;
}
.piano {
  position: relative;
  height: 110px;
  touch-action: none;
}
.white-row {
  display: flex;
  height: 100%;
}
.white {
  flex: 1;
  min-width: 0;
  background: linear-gradient(180deg, #ece8df 0%, #c5bfb1 100%);
  border-right: 1px solid rgba(0, 0, 0, 0.18);
  position: relative;
  transition: filter 40ms;
  cursor: pointer;
}
.white:last-child {
  border-right: none;
}
.white:hover {
  filter: brightness(0.97);
}
.white.active {
  background: linear-gradient(180deg, #f5a623 0%, #a06b1a 100%);
  filter: none;
}
.white-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-faint);
  pointer-events: none;
}

.black-row {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.black {
  position: absolute;
  top: 0;
  /* Real-piano ratio: black key ≈ 58% of white key width */
  width: calc((100% / var(--white-count)) * 0.58);
  height: 62%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #2a2a2f 0%, #0a0a0b 100%);
  border: 1px solid #000;
  border-radius: 0 0 3px 3px;
  box-shadow: inset 0 -3px 5px rgba(255, 255, 255, 0.08), 0 2px 4px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  cursor: pointer;
  transition: filter 40ms;
}
.black:hover {
  filter: brightness(1.3);
}
.black.active {
  background: linear-gradient(180deg, var(--accent) 0%, var(--accent-dim) 100%);
  filter: none;
}
</style>
