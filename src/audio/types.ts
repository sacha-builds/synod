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

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass'
export type FilterRouting = 'series' | 'parallel'

export type VoiceMode = 'mono' | 'para' | 'poly'
export type NotePriority = 'last' | 'low' | 'high'

export interface FilterPatch {
  /** Filter 1 is always treated as enabled. Field is meaningful for Filter 2. */
  enabled: boolean
  type: FilterType
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
  filter2: FilterPatch
  filterRouting: FilterRouting
  voiceMode: VoiceMode
  /** Portamento / glide time in seconds (mono only). 0 = instant pitch change. */
  glide: number
  /** Which held note plays when multiple are pressed (mono only). */
  notePriority: NotePriority
  /** Mono only. When true, new notes played while another is held don't retrigger envelopes. */
  legato: boolean
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
    filter: { enabled: true, type: 'lowpass', cutoff: 1200, resonance: 2, envAmount: 3000 },
    filter2: { enabled: false, type: 'highpass', cutoff: 200, resonance: 1, envAmount: 0 },
    filterRouting: 'series',
    voiceMode: 'poly',
    glide: 0,
    notePriority: 'last',
    legato: false,
  }
}

export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}
