import type { SynthPatch } from './types'
import { midiToFrequency } from './types'

/**
 * A single polyphonic voice: up to 3 oscillators → mixer → filter → amp → output.
 * Filter and amp each have their own ADSR envelope.
 */
export class Voice {
  private ctx: AudioContext
  private output: AudioNode
  private oscillators: OscillatorNode[] = []
  private oscGains: GainNode[] = []
  private mixer: GainNode
  private filter: BiquadFilterNode
  private amp: GainNode

  readonly note: number
  private released = false
  private endTime = Infinity

  constructor(ctx: AudioContext, output: AudioNode, note: number, velocity: number, patch: SynthPatch) {
    this.ctx = ctx
    this.output = output
    this.note = note

    const now = ctx.currentTime
    const baseFreq = midiToFrequency(note)
    const velGain = Math.max(0.05, velocity / 127)

    this.mixer = ctx.createGain()
    this.mixer.gain.value = 1

    this.filter = ctx.createBiquadFilter()
    this.filter.type = patch.filter.type
    this.filter.Q.value = patch.filter.resonance

    this.amp = ctx.createGain()
    this.amp.gain.value = 0

    this.mixer.connect(this.filter)
    this.filter.connect(this.amp)
    this.amp.connect(this.output)

    patch.oscillators.forEach((osc) => {
      if (!osc.enabled) return
      const node = ctx.createOscillator()
      node.type = osc.waveform
      node.frequency.value = baseFreq * Math.pow(2, osc.semitones / 12)
      node.detune.value = osc.detune
      const gain = ctx.createGain()
      gain.gain.value = osc.level * velGain
      node.connect(gain)
      gain.connect(this.mixer)
      node.start(now)
      this.oscillators.push(node)
      this.oscGains.push(gain)
    })

    // Amp envelope
    const a = patch.ampEnvelope
    this.amp.gain.cancelScheduledValues(now)
    this.amp.gain.setValueAtTime(0, now)
    this.amp.gain.linearRampToValueAtTime(1, now + a.attack)
    this.amp.gain.linearRampToValueAtTime(a.sustain, now + a.attack + a.decay)

    // Filter envelope — cutoff scheduled as absolute Hz values
    const f = patch.filterEnvelope
    const base = patch.filter.cutoff
    const peak = Math.min(20000, base + patch.filter.envAmount)
    const sus = Math.min(20000, base + patch.filter.envAmount * f.sustain)
    this.filter.frequency.cancelScheduledValues(now)
    this.filter.frequency.setValueAtTime(base, now)
    this.filter.frequency.linearRampToValueAtTime(peak, now + f.attack)
    this.filter.frequency.linearRampToValueAtTime(sus, now + f.attack + f.decay)
  }

  release(patch: SynthPatch): number {
    if (this.released) return this.endTime
    this.released = true
    const now = this.ctx.currentTime
    const a = patch.ampEnvelope
    const f = patch.filterEnvelope

    const currentAmp = this.amp.gain.value
    this.amp.gain.cancelScheduledValues(now)
    this.amp.gain.setValueAtTime(currentAmp, now)
    this.amp.gain.linearRampToValueAtTime(0, now + a.release)

    const currentCut = this.filter.frequency.value
    this.filter.frequency.cancelScheduledValues(now)
    this.filter.frequency.setValueAtTime(currentCut, now)
    this.filter.frequency.linearRampToValueAtTime(patch.filter.cutoff, now + f.release)

    this.endTime = now + Math.max(a.release, f.release) + 0.05
    return this.endTime
  }

  setFilterType(type: BiquadFilterType): void {
    this.filter.type = type
  }

  stop(): void {
    const stopAt = this.endTime === Infinity ? this.ctx.currentTime : this.endTime
    this.oscillators.forEach((o) => {
      try {
        o.stop(stopAt)
      } catch {
        /* already stopped */
      }
    })
  }

  /** Instant stop — bypasses any pending release envelope. */
  hardStop(): void {
    const now = this.ctx.currentTime
    this.amp.gain.cancelScheduledValues(now)
    this.amp.gain.setValueAtTime(0, now)
    this.oscillators.forEach((o) => {
      try {
        o.stop(now)
      } catch {
        /* already stopped */
      }
    })
  }

  isDone(now: number): boolean {
    return this.released && now >= this.endTime
  }
}
