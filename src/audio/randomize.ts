import type { FilterType, SynthPatch, Waveform } from './types'

/** Group of parameters a randomize pass targets. */
export type RandomizeGroup = 'all' | 'osc' | 'env' | 'filter' | 'voice'

/**
 * Randomization is an interpolation: for each target parameter we pick a
 * random value within a musically-sensible range, then lerp from the current
 * value to that random target by `amount` (0..1). So at amount=0 nothing
 * changes; at amount=1 the patch is fully re-rolled; intermediate values
 * nudge the patch toward randomness without straying too far. This is how
 * hardware synths like Hydrasynth do "randomize by N%".
 */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
/** Lerp in log space — for frequency / time params so perceptually we interpolate proportionally. */
function lerpLog(current: number, targetMin: number, targetMax: number, amount: number): number {
  const target = Math.exp(rand(Math.log(targetMin), Math.log(targetMax)))
  const c = Math.max(current, 1e-5)
  return Math.exp(lerp(Math.log(c), Math.log(target), amount))
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}
/** With probability amount, run the action. Lets us gate discrete switches
 *  (waveform, filter type) so they don't change on every single low-amount pass. */
function maybe(amount: number, fn: () => void): void {
  if (Math.random() < amount) fn()
}

const WAVEFORMS: readonly Waveform[] = ['sine', 'triangle', 'sawtooth', 'square']
const FILTER_TYPES: readonly FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass']

export function randomize(patch: SynthPatch, group: RandomizeGroup, amount: number): void {
  if (amount <= 0) return
  if (group === 'all' || group === 'osc') randomizeOsc(patch, amount)
  if (group === 'all' || group === 'env') randomizeEnv(patch, amount)
  if (group === 'all' || group === 'filter') randomizeFilter(patch, amount)
  if (group === 'all' || group === 'voice') randomizeVoice(patch, amount)
}

function randomizeOsc(patch: SynthPatch, amount: number): void {
  patch.oscillators.forEach((osc) => {
    // Skip disabled oscillators entirely — user's on/off choice stands
    if (!osc.enabled) return
    maybe(amount, () => {
      osc.waveform = pick(WAVEFORMS)
    })
    osc.semitones = Math.round(lerp(osc.semitones, rand(-12, 12), amount))
    osc.detune = Math.round(lerp(osc.detune, rand(-50, 50), amount))
    osc.level = Math.max(0, Math.min(1, lerp(osc.level, rand(0.25, 0.95), amount)))
  })
}

function randomizeEnv(patch: SynthPatch, amount: number): void {
  const envs = [patch.ampEnvelope, patch.filterEnvelope]
  envs.forEach((env, i) => {
    // Slightly snappier ranges for amp to avoid always-droning defaults
    const isAmp = i === 0
    env.attack = lerpLog(env.attack, 0.002, isAmp ? 1.5 : 0.6, amount)
    env.decay = lerpLog(env.decay, 0.02, 3, amount)
    env.sustain = lerp(env.sustain, rand(0, 1), amount)
    env.release = lerpLog(env.release, 0.05, 4, amount)
  })
}

function randomizeFilter(patch: SynthPatch, amount: number): void {
  maybe(amount, () => {
    patch.filter.type = pick(FILTER_TYPES)
  })
  patch.filter.cutoff = lerpLog(patch.filter.cutoff, 150, 14000, amount)
  patch.filter.resonance = lerp(patch.filter.resonance, rand(0.5, 10), amount)
  patch.filter.envAmount = lerp(patch.filter.envAmount, rand(0, 6000), amount)

  if (patch.filter2.enabled) {
    maybe(amount, () => {
      patch.filter2.type = pick(FILTER_TYPES)
    })
    patch.filter2.cutoff = lerpLog(patch.filter2.cutoff, 150, 14000, amount)
    patch.filter2.resonance = lerp(patch.filter2.resonance, rand(0.5, 10), amount)
    patch.filter2.envAmount = lerp(patch.filter2.envAmount, rand(0, 6000), amount)
  }

  // Routing flip — less likely than type changes
  if (Math.random() < amount * 0.35) {
    patch.filterRouting = patch.filterRouting === 'series' ? 'parallel' : 'series'
  }
}

function randomizeVoice(patch: SynthPatch, amount: number): void {
  // Deliberately *don't* randomize voiceMode / notePriority / legato — those
  // are stylistic choices the user almost never wants dice-rolled. Only
  // touch glide (and only in mono mode where it matters).
  if (patch.voiceMode === 'mono') {
    patch.glide = lerpLog(Math.max(patch.glide, 0.001), 0.001, 0.8, amount)
  }
}

/** Deep clone — used so we can store patch snapshots for undo. */
export function cloneSynthPatch(patch: SynthPatch): SynthPatch {
  return JSON.parse(JSON.stringify(patch))
}

/** Apply snapshot values back onto the reactive patch in place (so Vue
 *  reactivity stays intact — Object.assign on the nested fields keeps the
 *  proxy references). */
export function restoreSynthPatch(patch: SynthPatch, snap: SynthPatch): void {
  patch.masterGain = snap.masterGain
  patch.voiceMode = snap.voiceMode
  patch.glide = snap.glide
  patch.notePriority = snap.notePriority
  patch.legato = snap.legato
  patch.filterRouting = snap.filterRouting
  Object.assign(patch.filter, snap.filter)
  Object.assign(patch.filter2, snap.filter2)
  Object.assign(patch.ampEnvelope, snap.ampEnvelope)
  Object.assign(patch.filterEnvelope, snap.filterEnvelope)
  patch.oscillators.forEach((o, i) => Object.assign(o, snap.oscillators[i]))
}
