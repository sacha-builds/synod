import type { ArpPatch, FilterType, PartPatch, SynthPatch, Waveform } from './types'

/** Group of parameters a randomize pass targets. */
export type RandomizeGroup = 'all' | 'osc' | 'env' | 'filter' | 'voice'

/**
 * Randomization is an interpolation: for each target parameter we pick a
 * random value within a musically-sensible range, then lerp from the current
 * value to that random target by `amount` (0..1). So at amount=0 nothing
 * changes; at amount=1 the patch is fully re-rolled; intermediate values
 * nudge the patch toward randomness without straying too far — the same
 * "randomize by N%" pattern common on hardware synths.
 *
 * Operates on a single PartPatch; the UI passes in the active part so
 * randomization edits whichever part is currently being edited.
 */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function lerpLog(current: number, targetMin: number, targetMax: number, amount: number): number {
  const target = Math.exp(rand(Math.log(targetMin), Math.log(targetMax)))
  const c = Math.max(current, 1e-5)
  return Math.exp(lerp(Math.log(c), Math.log(target), amount))
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}
function maybe(amount: number, fn: () => void): void {
  if (Math.random() < amount) fn()
}

const WAVEFORMS: readonly Waveform[] = ['sine', 'triangle', 'sawtooth', 'square']
const FILTER_TYPES: readonly FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass']

export function randomize(part: PartPatch, group: RandomizeGroup, amount: number): void {
  if (amount <= 0) return
  if (group === 'all' || group === 'osc') randomizeOsc(part, amount)
  if (group === 'all' || group === 'env') randomizeEnv(part, amount)
  if (group === 'all' || group === 'filter') randomizeFilter(part, amount)
  if (group === 'all' || group === 'voice') randomizeVoice(part, amount)
}

function randomizeOsc(part: PartPatch, amount: number): void {
  part.oscillators.forEach((osc) => {
    if (!osc.enabled) return
    maybe(amount, () => {
      osc.waveform = pick(WAVEFORMS)
    })
    osc.semitones = Math.round(lerp(osc.semitones, rand(-12, 12), amount))
    osc.detune = Math.round(lerp(osc.detune, rand(-50, 50), amount))
    osc.level = Math.max(0, Math.min(1, lerp(osc.level, rand(0.25, 0.95), amount)))
  })
}

function randomizeEnv(part: PartPatch, amount: number): void {
  const envs = [part.ampEnvelope, part.filterEnvelope]
  envs.forEach((env, i) => {
    const isAmp = i === 0
    env.attack = lerpLog(env.attack, 0.002, isAmp ? 1.5 : 0.6, amount)
    env.decay = lerpLog(env.decay, 0.02, 3, amount)
    env.sustain = lerp(env.sustain, rand(0, 1), amount)
    env.release = lerpLog(env.release, 0.05, 4, amount)
  })
}

function randomizeFilter(part: PartPatch, amount: number): void {
  maybe(amount, () => {
    part.filter.type = pick(FILTER_TYPES)
  })
  part.filter.cutoff = lerpLog(part.filter.cutoff, 150, 14000, amount)
  part.filter.resonance = lerp(part.filter.resonance, rand(0.5, 10), amount)
  part.filter.envAmount = lerp(part.filter.envAmount, rand(0, 6000), amount)

  if (part.filter2.enabled) {
    maybe(amount, () => {
      part.filter2.type = pick(FILTER_TYPES)
    })
    part.filter2.cutoff = lerpLog(part.filter2.cutoff, 150, 14000, amount)
    part.filter2.resonance = lerp(part.filter2.resonance, rand(0.5, 10), amount)
    part.filter2.envAmount = lerp(part.filter2.envAmount, rand(0, 6000), amount)
  }

  if (Math.random() < amount * 0.35) {
    part.filterRouting = part.filterRouting === 'series' ? 'parallel' : 'series'
  }
}

function randomizeVoice(part: PartPatch, amount: number): void {
  if (part.voiceMode === 'mono') {
    part.glide = lerpLog(Math.max(part.glide, 0.001), 0.001, 0.8, amount)
  }
}

/** Deep clone — used to store patch snapshots for undo. */
export function cloneSynthPatch(patch: SynthPatch): SynthPatch {
  return JSON.parse(JSON.stringify(patch))
}
export function clonePart(part: PartPatch): PartPatch {
  return JSON.parse(JSON.stringify(part))
}

/** Apply snapshot values back onto the reactive patch in place, preserving
 *  proxy references so Vue reactivity keeps flowing. */
export function restoreSynthPatch(patch: SynthPatch, snap: SynthPatch): void {
  patch.masterGain = snap.masterGain
  patch.bpm = snap.bpm
  patch.activePart = snap.activePart
  patch.bimode = snap.bimode
  patch.splitNote = snap.splitNote
  Object.assign(patch.fx.reverb, snap.fx.reverb)
  Object.assign(patch.fx.delay, snap.fx.delay)
  restoreArp(patch.arp, snap.arp)
  restorePart(patch.parts[0], snap.parts[0])
  restorePart(patch.parts[1], snap.parts[1])
}

export function restorePart(part: PartPatch, snap: PartPatch): void {
  part.filterRouting = snap.filterRouting
  part.voiceMode = snap.voiceMode
  part.glide = snap.glide
  part.notePriority = snap.notePriority
  part.legato = snap.legato
  part.level = snap.level
  part.transpose = snap.transpose
  part.phaseReset = snap.phaseReset
  Object.assign(part.filter, snap.filter)
  Object.assign(part.filter2, snap.filter2)
  Object.assign(part.ampEnvelope, snap.ampEnvelope)
  Object.assign(part.filterEnvelope, snap.filterEnvelope)
  part.oscillators.forEach((o, i) => Object.assign(o, snap.oscillators[i]))
}

function restoreArp(arp: ArpPatch, snap: ArpPatch): void {
  arp.enabled = snap.enabled
  arp.mode = snap.mode
  arp.rate = snap.rate
  arp.gate = snap.gate
  arp.swing = snap.swing
  arp.octaves = snap.octaves
  arp.latch = snap.latch
  arp.usePattern = snap.usePattern
  arp.patternLength = snap.patternLength
  // Pattern is an array — replace element-wise to keep reactivity.
  for (let i = 0; i < arp.pattern.length; i++) {
    if (snap.pattern[i]) Object.assign(arp.pattern[i], snap.pattern[i])
  }
}
