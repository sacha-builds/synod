import type { SynthPatch } from './types'
import { midiToFrequency } from './types'

/**
 * A single voice: up to 3 oscillators → mixer → filter → amp → output.
 * Filter and amp each have their own ADSR envelope.
 *
 * Used directly as a polyphonic voice (one per note), and reused as the
 * single voice in mono mode — setNote() re-tunes the oscillators (with
 * optional glide) and retriggerEnvelopes() restarts the envelopes.
 */
export class Voice {
  private ctx: AudioContext
  private output: AudioNode
  private patchRef: SynthPatch
  private oscillators: OscillatorNode[] = []
  /** Tracks which oscillator-slot index each running oscillator corresponds to
   *  (0, 1, 2), so setNote can re-tune with the current semitone offsets. */
  private oscSlotIndex: number[] = []
  private oscGains: GainNode[] = []
  private mixer: GainNode
  private filter: BiquadFilterNode
  private amp: GainNode

  /** Current MIDI note. Mutable in mono mode. */
  note: number
  private released = false
  private endTime = Infinity

  constructor(ctx: AudioContext, output: AudioNode, note: number, velocity: number, patch: SynthPatch) {
    this.ctx = ctx
    this.output = output
    this.patchRef = patch
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

    patch.oscillators.forEach((osc, idx) => {
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
      this.oscSlotIndex.push(idx)
      this.oscGains.push(gain)
    })

    this.scheduleEnvelopes(now)
  }

  private scheduleEnvelopes(fromTime: number): void {
    const patch = this.patchRef
    const a = patch.ampEnvelope
    this.amp.gain.cancelScheduledValues(fromTime)
    this.amp.gain.setValueAtTime(this.amp.gain.value, fromTime)
    this.amp.gain.linearRampToValueAtTime(1, fromTime + a.attack)
    this.amp.gain.linearRampToValueAtTime(a.sustain, fromTime + a.attack + a.decay)

    const f = patch.filterEnvelope
    const base = patch.filter.cutoff
    const peak = Math.min(20000, base + patch.filter.envAmount)
    const sus = Math.min(20000, base + patch.filter.envAmount * f.sustain)
    this.filter.frequency.cancelScheduledValues(fromTime)
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, fromTime)
    this.filter.frequency.linearRampToValueAtTime(peak, fromTime + f.attack)
    this.filter.frequency.linearRampToValueAtTime(sus, fromTime + f.attack + f.decay)
  }

  /** Retune oscillators to a new note, optionally gliding over `glideSec`. */
  setNote(note: number, glideSec: number): void {
    this.note = note
    this.released = false
    this.endTime = Infinity
    const now = this.ctx.currentTime
    const baseFreq = midiToFrequency(note)
    const patch = this.patchRef

    this.oscillators.forEach((osc, i) => {
      const slot = patch.oscillators[this.oscSlotIndex[i]]
      const target = baseFreq * Math.pow(2, slot.semitones / 12)
      osc.frequency.cancelScheduledValues(now)
      if (glideSec <= 0) {
        osc.frequency.setValueAtTime(target, now)
      } else {
        // exponentialRampToValueAtTime requires positive values — osc frequency is always positive
        osc.frequency.setValueAtTime(Math.max(osc.frequency.value, 0.0001), now)
        osc.frequency.exponentialRampToValueAtTime(Math.max(target, 0.0001), now + glideSec)
      }
    })
  }

  /** Restart amp + filter envelopes from their current values (for mono
   *  retrigger). Doesn't affect oscillator frequencies. */
  retriggerEnvelopes(): void {
    this.released = false
    this.endTime = Infinity
    this.scheduleEnvelopes(this.ctx.currentTime)
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
