import { Voice } from './Voice'
import type { FilterType, SynthPatch, VoiceMode } from './types'
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

  /** All voices the synth has ever spawned that haven't finished their
   *  release tail yet. Includes voices that have been removed from
   *  polyVoices/monoVoice after noteOff but are still making sound.
   *  Panic iterates this to actually silence those tails; release
   *  param changes iterate this to reschedule in-flight tails. */
  private allVoices = new Set<Voice>()

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

  /** Resume the AudioContext. Fire-and-forget so callers can invoke from a
   *  user gesture handler without awaiting — critical on iOS Safari, which
   *  drops the user-gesture context across awaits and refuses to unlock
   *  audio if resume is promise-chained from a gesture. */
  resume(): void {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  setMasterGain(v: number): void {
    this.patch.masterGain = v
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setFilterType(type: FilterType, which: 1 | 2 = 1): void {
    if (which === 1) this.patch.filter.type = type
    else this.patch.filter2.type = type
    for (const voice of this.polyVoices.values()) voice.setFilterType(type, which)
    this.monoVoice?.setFilterType(type, which)
  }

  /** Reschedule the in-flight release of any currently-releasing voices.
   *  Called when the user changes the amp or filter envelope release knob. */
  rescheduleReleases(): void {
    this.sweepDoneVoices()
    for (const voice of this.allVoices) voice.rescheduleRelease()
  }

  private sweepDoneVoices(): void {
    const now = this.ctx.currentTime
    for (const v of this.allVoices) {
      if (v.isDone(now)) this.allVoices.delete(v)
    }
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

  /** Hard-kill everything currently making sound, including voices that are
   *  only still audible because they're playing out a release tail after
   *  their note-off already fired. Briefly dips master gain to absorb any
   *  click from abrupt cutoff. */
  panic(): void {
    const now = this.ctx.currentTime
    const target = this.patch.masterGain
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0, now)

    for (const voice of this.allVoices) voice.hardStop()
    this.allVoices.clear()
    this.polyVoices.clear()
    this.monoVoice = null
    this.heldNotes = []

    this.master.gain.setValueAtTime(0, now + 0.03)
    this.master.gain.linearRampToValueAtTime(target, now + 0.08)
  }

  // --- Poly ---
  private noteOnPoly(note: number, velocity: number): void {
    this.sweepDoneVoices()
    const existing = this.polyVoices.get(note)
    if (existing) {
      existing.release(this.patch)
      existing.stop()
      // existing stays in allVoices until its release tail finishes
    }
    const voice = new Voice(this.ctx, this.master, note, velocity, this.patch)
    this.polyVoices.set(note, voice)
    this.allVoices.add(voice)
  }

  private noteOffPoly(note: number): void {
    const voice = this.polyVoices.get(note)
    if (!voice) return
    voice.release(this.patch)
    voice.stop()
    this.polyVoices.delete(note)
    // Kept in allVoices until release tail finishes
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

  private noteOnMono(_note: number, velocity: number): void {
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
      const voice = new Voice(this.ctx, this.master, active, velocity, this.patch)
      this.monoVoice = voice
      this.allVoices.add(voice)
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
