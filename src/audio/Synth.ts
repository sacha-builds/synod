import { Voice } from './Voice'
import type { FilterType, SynthPatch, VoiceMode } from './types'
import { defaultPatch } from './types'

/** Generate a stereo impulse response of exponentially-decaying white noise.
 *  Simple algorithmic reverb tail — not a real room IR, but cheap and sounds
 *  like a plate/hall depending on decay. */
function buildReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3)
    }
  }
  return buffer
}

/**
 * Polyphonic / monophonic synth. Holds the shared AudioContext, master
 * gain, and an analyser for the oscilloscope. Dispatches note events to
 * the active voice mode.
 */
export class Synth {
  ctx: AudioContext
  /** Bus all voices connect to. Splits into dry + reverb send + delay send. */
  voiceBus: GainNode
  master: GainNode
  analyser: AnalyserNode
  patch: SynthPatch

  // FX: parallel sends from voiceBus. Dry always on; wet gains control mix.
  private reverb: ConvolverNode
  private reverbWet: GainNode
  private delay: DelayNode
  private delayFeedback: GainNode
  private delayWet: GainNode

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

    this.voiceBus = this.ctx.createGain()
    this.voiceBus.gain.value = 1

    // Reverb send: voiceBus → reverb → reverbWet → master
    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = buildReverbIR(this.ctx, patch.fx.reverb.decay)
    this.reverbWet = this.ctx.createGain()
    this.reverbWet.gain.value = patch.fx.reverb.enabled ? patch.fx.reverb.mix : 0

    // Delay send: voiceBus → delay → delayWet → master (delay → delayFeedback → delay)
    this.delay = this.ctx.createDelay(5)
    this.delay.delayTime.value = patch.fx.delay.time
    this.delayFeedback = this.ctx.createGain()
    this.delayFeedback.gain.value = patch.fx.delay.feedback
    this.delay.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delay)
    this.delayWet = this.ctx.createGain()
    this.delayWet.gain.value = patch.fx.delay.enabled ? patch.fx.delay.mix : 0

    // Wiring
    this.voiceBus.connect(this.master) // dry
    this.voiceBus.connect(this.reverb)
    this.reverb.connect(this.reverbWet)
    this.reverbWet.connect(this.master)
    this.voiceBus.connect(this.delay)
    this.delay.connect(this.delayWet)
    this.delayWet.connect(this.master)

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

  // --- FX setters ---
  private smooth(param: AudioParam, target: number): void {
    param.setTargetAtTime(target, this.ctx.currentTime, 0.02)
  }

  setReverbEnabled(v: boolean): void {
    this.patch.fx.reverb.enabled = v
    this.smooth(this.reverbWet.gain, v ? this.patch.fx.reverb.mix : 0)
  }
  setReverbMix(v: number): void {
    this.patch.fx.reverb.mix = v
    if (this.patch.fx.reverb.enabled) this.smooth(this.reverbWet.gain, v)
  }
  setReverbDecay(v: number): void {
    this.patch.fx.reverb.decay = v
    // Rebuild the IR. Cheap enough to do per-change (white-noise exp decay).
    this.reverb.buffer = buildReverbIR(this.ctx, v)
  }

  setDelayEnabled(v: boolean): void {
    this.patch.fx.delay.enabled = v
    this.smooth(this.delayWet.gain, v ? this.patch.fx.delay.mix : 0)
  }
  setDelayTime(v: number): void {
    this.patch.fx.delay.time = v
    this.smooth(this.delay.delayTime, v)
  }
  setDelayFeedback(v: number): void {
    this.patch.fx.delay.feedback = v
    this.smooth(this.delayFeedback.gain, v)
  }
  setDelayMix(v: number): void {
    this.patch.fx.delay.mix = v
    if (this.patch.fx.delay.enabled) this.smooth(this.delayWet.gain, v)
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
   *  their note-off already fired. Also flushes the delay feedback loop so
   *  an echoing tail doesn't survive the panic. Briefly dips master gain
   *  to absorb any click from abrupt cutoff. */
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

    // Flush delay feedback so an in-flight echo tail dies instead of
    // playing itself out after master restores.
    this.delayFeedback.gain.cancelScheduledValues(now)
    this.delayFeedback.gain.setValueAtTime(0, now)
    this.delayFeedback.gain.setValueAtTime(0, now + 0.1)
    this.delayFeedback.gain.setTargetAtTime(this.patch.fx.delay.feedback, now + 0.15, 0.02)

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
    const voice = new Voice(this.ctx, this.voiceBus, note, velocity, this.patch)
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
      const voice = new Voice(this.ctx, this.voiceBus, active, velocity, this.patch)
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
