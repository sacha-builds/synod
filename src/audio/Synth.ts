import { Voice } from './Voice'
import type { FilterType, SynthPatch } from './types'
import { defaultPatch } from './types'

/**
 * Polyphonic synth. Holds the shared AudioContext, master gain, and an analyser
 * for the oscilloscope. Voice lifecycle is managed here.
 */
export class Synth {
  ctx: AudioContext
  master: GainNode
  analyser: AnalyserNode
  patch: SynthPatch

  private voices = new Map<number, Voice>()
  private cleanupTimer: number | null = null

  constructor(patch: SynthPatch = defaultPatch()) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.patch = patch

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0

    this.master = this.ctx.createGain()
    this.master.gain.value = patch.masterGain
    this.master.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  /** Must be called from a user gesture to unlock audio on browsers that suspend by default. */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  setMasterGain(v: number): void {
    this.patch.masterGain = v
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setFilterType(type: FilterType): void {
    this.patch.filter.type = type
    for (const voice of this.voices.values()) {
      voice.setFilterType(type)
    }
  }

  noteOn(note: number, velocity = 100): void {
    // Steal existing voice on same note
    const existing = this.voices.get(note)
    if (existing) {
      existing.release(this.patch)
      existing.stop()
    }
    const voice = new Voice(this.ctx, this.master, note, velocity, this.patch)
    this.voices.set(note, voice)
  }

  noteOff(note: number): void {
    const voice = this.voices.get(note)
    if (!voice) return
    voice.release(this.patch)
    voice.stop()
    this.voices.delete(note)
    this.scheduleCleanup()
  }

  allNotesOff(): void {
    for (const voice of this.voices.values()) {
      voice.release(this.patch)
      voice.stop()
    }
    this.voices.clear()
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer !== null) return
    this.cleanupTimer = window.setTimeout(() => {
      this.cleanupTimer = null
    }, 500)
  }
}
