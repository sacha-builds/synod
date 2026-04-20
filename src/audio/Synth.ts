import { Voice } from './Voice'
import type { FilterType, NotePriority, SynthPatch, VoiceMode } from './types'
import { defaultPatch } from './types'

/**
 * Polyphonic / monophonic synth. Holds the shared AudioContext, master
 * gain, and an analyser for the oscilloscope. Dispatches note events to
 * the active voice mode.
 */
export class Synth {
  ctx: AudioContext
  master: GainNode
  analyser: AnalyserNode
  patch: SynthPatch

  // Poly state
  private polyVoices = new Map<number, Voice>()

  // Mono state
  private monoVoice: Voice | null = null

  // Shared state — the stack of currently-held notes (latest-pressed last).
  // Used for mono note priority and for all-notes-off bookkeeping.
  private heldNotes: number[] = []

  constructor(patch: SynthPatch = defaultPatch()) {
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    this.patch = patch

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0

    this.master = this.ctx.createGain()
    this.master.gain.value = patch.masterGain
    this.master.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setMasterGain(v: number): void {
    this.patch.masterGain = v
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setFilterType(type: FilterType): void {
    this.patch.filter.type = type
    for (const voice of this.polyVoices.values()) voice.setFilterType(type)
    this.monoVoice?.setFilterType(type)
  }

  /** Switch voice mode. Gracefully releases anything currently playing in the
   *  old mode so we don't leak voices. */
  setVoiceMode(mode: VoiceMode): void {
    if (this.patch.voiceMode === mode) return
    this.allNotesOff()
    this.patch.voiceMode = mode
  }

  noteOn(note: number, velocity = 100): void {
    // Track in held stack regardless of mode — keeps panic/allNotesOff clean.
    const existingIdx = this.heldNotes.indexOf(note)
    if (existingIdx >= 0) this.heldNotes.splice(existingIdx, 1)
    this.heldNotes.push(note)

    if (this.patch.voiceMode === 'mono') this.noteOnMono(note, velocity)
    else this.noteOnPoly(note, velocity)
  }

  noteOff(note: number): void {
    const idx = this.heldNotes.indexOf(note)
    if (idx >= 0) this.heldNotes.splice(idx, 1)

    if (this.patch.voiceMode === 'mono') this.noteOffMono(note)
    else this.noteOffPoly(note)
  }

  allNotesOff(): void {
    for (const voice of this.polyVoices.values()) {
      voice.release(this.patch)
      voice.stop()
    }
    this.polyVoices.clear()
    if (this.monoVoice) {
      this.monoVoice.release(this.patch)
      this.monoVoice.stop()
      this.monoVoice = null
    }
    this.heldNotes = []
  }

  panic(): void {
    const now = this.ctx.currentTime
    const target = this.patch.masterGain
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0, now)
    for (const voice of this.polyVoices.values()) voice.hardStop()
    this.polyVoices.clear()
    this.monoVoice?.hardStop()
    this.monoVoice = null
    this.heldNotes = []
    this.master.gain.setValueAtTime(0, now + 0.03)
    this.master.gain.linearRampToValueAtTime(target, now + 0.08)
  }

  // --- Poly ---
  private noteOnPoly(note: number, velocity: number): void {
    const existing = this.polyVoices.get(note)
    if (existing) {
      existing.release(this.patch)
      existing.stop()
    }
    const voice = new Voice(this.ctx, this.master, note, velocity, this.patch)
    this.polyVoices.set(note, voice)
  }

  private noteOffPoly(note: number): void {
    const voice = this.polyVoices.get(note)
    if (!voice) return
    voice.release(this.patch)
    voice.stop()
    this.polyVoices.delete(note)
  }

  // --- Mono ---
  private pickPriorityNote(): number | null {
    if (this.heldNotes.length === 0) return null
    switch (this.patch.notePriority) {
      case 'low':
        return Math.min(...this.heldNotes)
      case 'high':
        return Math.max(...this.heldNotes)
      case 'last':
      default:
        return this.heldNotes[this.heldNotes.length - 1]
    }
  }

  private noteOnMono(note: number, velocity: number): void {
    const active = this.pickPriorityNote()
    if (active === null) return

    // Priority says "keep holding the one we're already on" — ignore
    if (this.monoVoice && !this.monoVoice.isDone(this.ctx.currentTime) && this.monoVoice.note === active) {
      // Still retrigger if legato is off AND the incoming note was actually higher/lower
      // priority (unusual but possible under low/high priority). Otherwise no-op.
      return
    }

    if (!this.monoVoice || this.monoVoice.isDone(this.ctx.currentTime)) {
      // No active voice — create one on the target note
      this.monoVoice = new Voice(this.ctx, this.master, active, velocity, this.patch)
      return
    }

    // Active voice playing a different note — glide to new note
    this.monoVoice.setNote(active, this.patch.glide)
    if (!this.patch.legato) this.monoVoice.retriggerEnvelopes()
  }

  private noteOffMono(_note: number): void {
    if (!this.monoVoice) return
    const next = this.pickPriorityNote()
    if (next === null) {
      // No notes left — release envelope
      this.monoVoice.release(this.patch)
      this.monoVoice.stop()
      this.monoVoice = null
      return
    }
    if (next !== this.monoVoice.note) {
      // Fall back to another held note
      this.monoVoice.setNote(next, this.patch.glide)
      // No retrigger on fall-back — it's a "the previous note resumed"
    }
  }
}
