import { Voice } from './Voice'
import type { BiMode, FilterType, PartPatch, SynthPatch, VoiceMode } from './types'
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
 * One side of a bitimbral synth — its own voice pool (poly / mono / etc)
 * driven by its own PartPatch. Outputs into `partBus`, a gain node that the
 * outer Synth uses to balance the two parts. Construction wires the part's
 * voice chain into partBus; voices are created on demand.
 */
class Part {
  private ctx: AudioContext
  readonly partBus: GainNode
  patch: PartPatch

  private polyVoices = new Map<number, Voice>()
  private monoVoice: Voice | null = null
  /** All voices this part has spawned that haven't finished their release
   *  tail yet. Includes voices removed from polyVoices/monoVoice after
   *  noteOff but still audible. Panic iterates to silence tails. */
  allVoices = new Set<Voice>()
  private heldNotes: number[] = []

  constructor(ctx: AudioContext, output: AudioNode, patch: PartPatch) {
    this.ctx = ctx
    this.patch = patch
    this.partBus = ctx.createGain()
    this.partBus.gain.value = patch.level
    this.partBus.connect(output)
  }

  setLevel(v: number): void {
    this.patch.level = v
    this.partBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setFilterType(type: FilterType, which: 1 | 2 = 1): void {
    if (which === 1) this.patch.filter.type = type
    else this.patch.filter2.type = type
    for (const voice of this.polyVoices.values()) voice.setFilterType(type, which)
    this.monoVoice?.setFilterType(type, which)
  }

  setVoiceMode(mode: VoiceMode): void {
    if (this.patch.voiceMode === mode) return
    this.releaseAll()
    this.patch.voiceMode = mode
  }

  noteOn(note: number, velocity: number, startTime?: number): void {
    const existingIdx = this.heldNotes.indexOf(note)
    if (existingIdx >= 0) this.heldNotes.splice(existingIdx, 1)
    this.heldNotes.push(note)

    if (this.patch.voiceMode === 'mono') this.noteOnMono(velocity, startTime)
    else this.noteOnPoly(note, velocity, startTime)
  }

  noteOff(note: number, atTime?: number): void {
    const idx = this.heldNotes.indexOf(note)
    if (idx < 0 && !this.polyVoices.has(note) && this.monoVoice?.note !== note) return
    if (idx >= 0) this.heldNotes.splice(idx, 1)
    if (this.patch.voiceMode === 'mono') this.noteOffMono(atTime)
    else this.noteOffPoly(note, atTime)
  }

  /** Graceful release of everything — uses the envelope release. */
  releaseAll(): void {
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

  /** Instant kill. Disconnects each voice from output. Used by panic. */
  hardStopAll(): void {
    for (const voice of this.allVoices) voice.hardStop()
    this.allVoices.clear()
    this.polyVoices.clear()
    this.monoVoice = null
    this.heldNotes = []
  }

  /** Sweep done voices from allVoices so the set doesn't grow unbounded. */
  sweep(): void {
    const now = this.ctx.currentTime
    for (const v of this.allVoices) {
      if (v.isDone(now)) this.allVoices.delete(v)
    }
  }

  rescheduleReleases(): void {
    this.sweep()
    for (const v of this.allVoices) v.rescheduleRelease()
  }

  private noteOnPoly(note: number, velocity: number, startTime?: number): void {
    this.sweep()
    const existing = this.polyVoices.get(note)
    if (existing) {
      existing.release(this.patch, startTime)
      existing.stop()
    }
    const voice = new Voice(this.ctx, this.partBus, note, velocity, this.patch, startTime)
    this.polyVoices.set(note, voice)
    this.allVoices.add(voice)
  }

  private noteOffPoly(note: number, atTime?: number): void {
    const voice = this.polyVoices.get(note)
    if (!voice) return
    voice.release(this.patch, atTime)
    voice.stop()
    this.polyVoices.delete(note)
  }

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

  private noteOnMono(velocity: number, startTime?: number): void {
    const active = this.pickPriorityNote()
    if (active === null) return
    if (this.monoVoice && !this.monoVoice.isDone(this.ctx.currentTime) && this.monoVoice.note === active) return

    if (!this.monoVoice || this.monoVoice.isDone(this.ctx.currentTime)) {
      const voice = new Voice(this.ctx, this.partBus, active, velocity, this.patch, startTime)
      this.monoVoice = voice
      this.allVoices.add(voice)
      return
    }
    this.monoVoice.setNote(active, this.patch.glide)
    if (!this.patch.legato) this.monoVoice.retriggerEnvelopes()
  }

  private noteOffMono(atTime?: number): void {
    if (!this.monoVoice) return
    const next = this.pickPriorityNote()
    if (next === null) {
      this.monoVoice.release(this.patch, atTime)
      this.monoVoice.stop()
      this.monoVoice = null
      return
    }
    if (next !== this.monoVoice.note) {
      this.monoVoice.setNote(next, this.patch.glide)
    }
  }
}

/**
 * Bitimbral synth: two independent Part engines summed through a shared
 * voiceBus, then routed through global FX (reverb + delay) into the master.
 * An analyser sits between master and destination for the oscilloscope.
 */
export class Synth {
  ctx: AudioContext
  /** Bus that both parts feed into. Splits into dry + reverb + delay. */
  voiceBus: GainNode
  master: GainNode
  analyser: AnalyserNode
  patch: SynthPatch
  parts: [Part, Part]

  private reverb: ConvolverNode
  private reverbWet: GainNode
  private delay: DelayNode
  private delayFeedback: GainNode
  private delayWet: GainNode

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

    // FX sends
    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = buildReverbIR(this.ctx, patch.fx.reverb.decay)
    this.reverbWet = this.ctx.createGain()
    this.reverbWet.gain.value = patch.fx.reverb.enabled ? patch.fx.reverb.mix : 0

    this.delay = this.ctx.createDelay(5)
    this.delay.delayTime.value = patch.fx.delay.time
    this.delayFeedback = this.ctx.createGain()
    this.delayFeedback.gain.value = patch.fx.delay.feedback
    this.delay.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delay)
    this.delayWet = this.ctx.createGain()
    this.delayWet.gain.value = patch.fx.delay.enabled ? patch.fx.delay.mix : 0

    this.voiceBus.connect(this.master) // dry
    this.voiceBus.connect(this.reverb)
    this.reverb.connect(this.reverbWet)
    this.reverbWet.connect(this.master)
    this.voiceBus.connect(this.delay)
    this.delay.connect(this.delayWet)
    this.delayWet.connect(this.master)

    this.master.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)

    this.parts = [
      new Part(this.ctx, this.voiceBus, patch.parts[0]),
      new Part(this.ctx, this.voiceBus, patch.parts[1]),
    ]
  }

  /** Update internal Part patch references when the SynthPatch reference
   *  is replaced (e.g. via preset load through restoreSynthPatch). The
   *  parts are re-pointed at the new patch's nested PartPatch objects so
   *  subsequent mutations on them flow into the audio engine. */
  syncPartPatches(): void {
    this.parts[0].patch = this.patch.parts[0]
    this.parts[1].patch = this.patch.parts[1]
    this.parts[0].setLevel(this.patch.parts[0].level)
    this.parts[1].setLevel(this.patch.parts[1].level)
  }

  resume(): void {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  setMasterGain(v: number): void {
    this.patch.masterGain = v
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setPartLevel(partIdx: 0 | 1, v: number): void {
    this.parts[partIdx].setLevel(v)
  }

  setPartFilterType(partIdx: 0 | 1, type: FilterType, which: 1 | 2 = 1): void {
    this.parts[partIdx].setFilterType(type, which)
  }

  setPartVoiceMode(partIdx: 0 | 1, mode: VoiceMode): void {
    this.parts[partIdx].setVoiceMode(mode)
  }

  rescheduleReleases(): void {
    this.parts[0].rescheduleReleases()
    this.parts[1].rescheduleReleases()
  }

  // FX setters (global)
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

  /** Which parts should receive this note given the current bimode. */
  private partsForNote(note: number): Part[] {
    const mode: BiMode = this.patch.bimode
    if (mode === 'single') return [this.parts[0]]
    if (mode === 'layer') return [this.parts[0], this.parts[1]]
    return [note < this.patch.splitNote ? this.parts[0] : this.parts[1]]
  }

  noteOn(note: number, velocity = 100, startTime?: number): void {
    for (const part of this.partsForNote(note)) part.noteOn(note, velocity, startTime)
  }

  noteOff(note: number, atTime?: number): void {
    // Noteoff goes to every part — idempotent if the part doesn't have the
    // voice, so we don't need to remember where a note came from.
    this.parts[0].noteOff(note, atTime)
    this.parts[1].noteOff(note, atTime)
  }

  allNotesOff(): void {
    this.parts[0].releaseAll()
    this.parts[1].releaseAll()
  }

  panic(): void {
    const now = this.ctx.currentTime
    const target = this.patch.masterGain
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0, now)

    this.parts[0].hardStopAll()
    this.parts[1].hardStopAll()

    // Flush delay feedback so an in-flight echo tail dies cleanly.
    this.delayFeedback.gain.cancelScheduledValues(now)
    this.delayFeedback.gain.setValueAtTime(0, now)
    this.delayFeedback.gain.setValueAtTime(0, now + 0.1)
    this.delayFeedback.gain.setTargetAtTime(this.patch.fx.delay.feedback, now + 0.15, 0.02)

    this.master.gain.setValueAtTime(0, now + 0.03)
    this.master.gain.linearRampToValueAtTime(target, now + 0.08)
  }
}
