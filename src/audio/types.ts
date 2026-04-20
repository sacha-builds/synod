export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square'

export interface OscillatorPatch {
  enabled: boolean
  waveform: Waveform
  /** Semitones offset from played note (-24..+24) */
  semitones: number
  /** Cents fine detune (-100..+100) */
  detune: number
  /** Mix level 0..1 */
  level: number
}

export interface EnvelopePatch {
  /** seconds */
  attack: number
  /** seconds */
  decay: number
  /** 0..1 */
  sustain: number
  /** seconds */
  release: number
}

export interface FilterPatch {
  /** Cutoff in Hz (20..20000) */
  cutoff: number
  /** Resonance Q (0.1..20) */
  resonance: number
  /** Envelope amount in Hz — added to cutoff at envelope peak */
  envAmount: number
}

export interface SynthPatch {
  oscillators: [OscillatorPatch, OscillatorPatch, OscillatorPatch]
  /** Master gain 0..1 */
  masterGain: number
  ampEnvelope: EnvelopePatch
  filterEnvelope: EnvelopePatch
  filter: FilterPatch
}

export function defaultPatch(): SynthPatch {
  return {
    oscillators: [
      { enabled: true, waveform: 'sawtooth', semitones: 0, detune: 0, level: 0.5 },
      { enabled: true, waveform: 'sawtooth', semitones: 0, detune: -7, level: 0.4 },
      { enabled: false, waveform: 'sine', semitones: -12, detune: 0, level: 0.3 },
    ],
    masterGain: 0.6,
    ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.4 },
    filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.3 },
    filter: { cutoff: 1200, resonance: 2, envAmount: 3000 },
  }
}

export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}
