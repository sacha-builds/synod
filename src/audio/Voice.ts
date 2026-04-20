import type { FilterPatch, PartPatch } from './types'
import { midiToFrequency } from './types'

/** Cache of pulse PeriodicWaves keyed by width bucket + AudioContext.
 *  Widths are quantized to 2% buckets so minor knob jitter doesn't blow
 *  the cache, and so identical-width oscillators across voices share one wave. */
const pulseCache = new WeakMap<AudioContext, Map<number, PeriodicWave>>()

function getPulseWave(ctx: AudioContext, width: number): PeriodicWave {
  let perCtx = pulseCache.get(ctx)
  if (!perCtx) {
    perCtx = new Map()
    pulseCache.set(ctx, perCtx)
  }
  const clamped = Math.min(0.95, Math.max(0.05, width))
  const bucket = Math.round(clamped * 50) // 50 unique widths
  const cached = perCtx.get(bucket)
  if (cached) return cached
  const w = bucket / 50
  const wave = buildPulseWave(ctx, w)
  perCtx.set(bucket, wave)
  return wave
}

function buildPulseWave(ctx: AudioContext, width: number, harmonics = 64): PeriodicWave {
  // Pulse Fourier series:
  //   a_n (cosine) = (2 / (πn)) * sin(2πnw)
  //   b_n (sine)   = (2 / (πn)) * (1 - cos(2πnw))
  // w=0.5 collapses cosines to 0 and gives the classic odd-harmonic square.
  const real = new Float32Array(harmonics)
  const imag = new Float32Array(harmonics)
  for (let n = 1; n < harmonics; n++) {
    const angle = 2 * Math.PI * n * width
    real[n] = (2 / (Math.PI * n)) * Math.sin(angle)
    imag[n] = (2 / (Math.PI * n)) * (1 - Math.cos(angle))
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false })
}

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
  private patchRef: PartPatch
  private oscillators: OscillatorNode[] = []
  /** Tracks which oscillator-slot index each running oscillator corresponds to
   *  (0, 1, 2), so setNote can re-tune with the current semitone offsets. */
  private oscSlotIndex: number[] = []
  private oscGains: GainNode[] = []
  private mixer: GainNode
  private filter: BiquadFilterNode
  private filter2: BiquadFilterNode
  /** Whether filter2 is wired into the signal path for this voice. Captured at
   *  construction; routing changes take effect on the next note. */
  private filter2Active: boolean
  private amp: GainNode

  /** Current MIDI note. Mutable in mono mode. */
  note: number
  /** True once release() has been called. Exposed so the synth can
   *  reschedule the in-flight release when envelope params change. */
  released = false
  private endTime = Infinity

  /** Semitone offset added to every frequency calculation. Lets a Part
   *  apply its own `transpose` without the voice's bookkeeping (the
   *  polyVoices map, mono priority, note-off lookup) needing to know. */
  private noteOffset: number

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    note: number,
    velocity: number,
    patch: PartPatch,
    startTime?: number,
    noteOffset = 0,
  ) {
    this.ctx = ctx
    this.output = output
    this.patchRef = patch
    this.note = note
    this.noteOffset = noteOffset

    const now = startTime ?? ctx.currentTime
    const baseFreq = midiToFrequency(note + this.noteOffset)
    const velGain = Math.max(0.05, velocity / 127)

    this.mixer = ctx.createGain()
    this.mixer.gain.value = 1

    this.filter = ctx.createBiquadFilter()
    this.filter.type = patch.filter.type
    this.filter.Q.value = patch.filter.resonance

    this.filter2 = ctx.createBiquadFilter()
    this.filter2.type = patch.filter2.type
    this.filter2.Q.value = patch.filter2.resonance

    this.amp = ctx.createGain()
    this.amp.gain.value = 0
    this.amp.connect(this.output)

    this.filter2Active = patch.filter2.enabled
    if (!this.filter2Active) {
      // Single-filter path
      this.mixer.connect(this.filter)
      this.filter.connect(this.amp)
    } else if (patch.filterRouting === 'series') {
      // mixer → filter1 → filter2 → amp
      this.mixer.connect(this.filter)
      this.filter.connect(this.filter2)
      this.filter2.connect(this.amp)
    } else {
      // Parallel: mixer feeds both; both sum into amp
      this.mixer.connect(this.filter)
      this.mixer.connect(this.filter2)
      this.filter.connect(this.amp)
      this.filter2.connect(this.amp)
    }

    patch.oscillators.forEach((osc, idx) => {
      if (!osc.enabled) return
      const node = ctx.createOscillator()
      if (osc.waveform === 'pulse') {
        // Web Audio's OscillatorNode has no duty-cycle param, so build a
        // PeriodicWave from the Fourier series of a pulse at the requested
        // width. Cached at synth level so identical widths aren't rebuilt.
        node.setPeriodicWave(getPulseWave(ctx, osc.pulseWidth))
      } else {
        node.type = osc.waveform
      }
      node.frequency.value = baseFreq * Math.pow(2, osc.semitones / 12)
      node.detune.value = osc.detune
      const gain = ctx.createGain()
      gain.gain.value = osc.level * velGain
      node.connect(gain)
      gain.connect(this.mixer)
      // Phase reset OFF = organic analog character — each oscillator starts
      // at a small random time offset so their relative phases (and therefore
      // the beating between detuned stacks) differ on every note.
      const oscStart = patch.phaseReset ? now : now + Math.random() * 0.012
      node.start(oscStart)
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

    this.scheduleFilterEnv(this.filter, patch.filter, fromTime)
    if (this.filter2Active) {
      this.scheduleFilterEnv(this.filter2, patch.filter2, fromTime)
    }
  }

  private scheduleFilterEnv(filter: BiquadFilterNode, fp: FilterPatch, fromTime: number): void {
    const f = this.patchRef.filterEnvelope
    const base = fp.cutoff
    const peak = Math.min(20000, base + fp.envAmount)
    const sus = Math.min(20000, base + fp.envAmount * f.sustain)
    filter.frequency.cancelScheduledValues(fromTime)
    filter.frequency.setValueAtTime(filter.frequency.value, fromTime)
    filter.frequency.linearRampToValueAtTime(peak, fromTime + f.attack)
    filter.frequency.linearRampToValueAtTime(sus, fromTime + f.attack + f.decay)
  }

  /** Retune oscillators to a new note, optionally gliding over `glideSec`. */
  setNote(note: number, glideSec: number): void {
    this.note = note
    this.released = false
    this.endTime = Infinity
    const now = this.ctx.currentTime
    const baseFreq = midiToFrequency(note + this.noteOffset)
    const patch = this.patchRef

    this.oscillators.forEach((osc, i) => {
      const slot = patch.oscillators[this.oscSlotIndex[i]]
      const target = baseFreq * Math.pow(2, slot.semitones / 12)
      // If waveform or pulseWidth changed since this voice was built, swap
      // the PeriodicWave in place so mono glides pick up the new sound.
      if (slot.waveform === 'pulse') osc.setPeriodicWave(getPulseWave(this.ctx, slot.pulseWidth))
      else if (osc.type !== slot.waveform) osc.type = slot.waveform
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

  release(patch: PartPatch, atTime?: number): number {
    if (this.released) return this.endTime
    this.released = true
    const now = atTime ?? this.ctx.currentTime
    const a = patch.ampEnvelope
    const f = patch.filterEnvelope

    const currentAmp = this.amp.gain.value
    this.amp.gain.cancelScheduledValues(now)
    this.amp.gain.setValueAtTime(currentAmp, now)
    this.amp.gain.linearRampToValueAtTime(0, now + a.release)

    this.releaseFilter(this.filter, patch.filter, now, f.release)
    if (this.filter2Active) {
      this.releaseFilter(this.filter2, patch.filter2, now, f.release)
    }

    this.endTime = now + Math.max(a.release, f.release) + 0.05
    return this.endTime
  }

  private releaseFilter(filter: BiquadFilterNode, fp: FilterPatch, now: number, releaseSec: number): void {
    const cur = filter.frequency.value
    filter.frequency.cancelScheduledValues(now)
    filter.frequency.setValueAtTime(cur, now)
    filter.frequency.linearRampToValueAtTime(fp.cutoff, now + releaseSec)
  }

  /** Reschedule the in-progress release from "now" using the current envelope
   *  params. No-op if the voice isn't currently releasing. Lets the user
   *  shorten (or extend) the release of a sustaining tail by turning the
   *  release knob mid-flight. */
  rescheduleRelease(): void {
    if (!this.released) return
    const now = this.ctx.currentTime
    const patch = this.patchRef
    const a = patch.ampEnvelope
    const f = patch.filterEnvelope

    const curAmp = this.amp.gain.value
    this.amp.gain.cancelScheduledValues(now)
    this.amp.gain.setValueAtTime(curAmp, now)
    this.amp.gain.linearRampToValueAtTime(0, now + a.release)

    this.releaseFilter(this.filter, patch.filter, now, f.release)
    if (this.filter2Active) {
      this.releaseFilter(this.filter2, patch.filter2, now, f.release)
    }

    const newEnd = now + Math.max(a.release, f.release) + 0.05
    this.endTime = newEnd
    this.oscillators.forEach((o) => {
      try {
        o.stop(newEnd)
      } catch {
        /* already stopped */
      }
    })
  }

  setFilterType(type: BiquadFilterType, which: 1 | 2 = 1): void {
    if (which === 1) this.filter.type = type
    else this.filter2.type = type
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

  /** Instant stop — bypasses any pending release envelope, and severs the
   *  amp-to-output connection so no residual signal can pass even if the
   *  AudioParam cancel/setValueAtTime dance doesn't clobber an in-progress
   *  ramp cleanly. Voice is unusable after this. */
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
    try {
      this.amp.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  isDone(now: number): boolean {
    return this.released && now >= this.endTime
  }
}
