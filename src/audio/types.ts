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

export interface ReverbPatch {
  enabled: boolean
  /** Decay length in seconds (0.3..8). */
  decay: number
  /** Wet mix 0..1. */
  mix: number
}

export interface DelayPatch {
  enabled: boolean
  /** Delay time in seconds (0.01..2). */
  time: number
  /** Feedback 0..0.95 (bounded below 1 to avoid runaway). */
  feedback: number
  /** Wet mix 0..1. */
  mix: number
}

export interface FXPatch {
  reverb: ReverbPatch
  delay: DelayPatch
}

export type ArpMode = 'up' | 'down' | 'updown' | 'order' | 'random' | 'chord'
export type ArpRate = '1/4' | '1/8' | '1/16' | '1/32' | '1/8t' | '1/16t' | '1/8d' | '1/16d'

export interface ArpStep {
  /** Whether this step plays a note (false = rest) */
  active: boolean
  /** Octave offset applied on top of mode-chosen octave (-2..+2) */
  octave: number
  /** Velocity multiplier — used for accents (0.3..1.5) */
  velocityMul: number
}

export interface ArpPatch {
  enabled: boolean
  mode: ArpMode
  rate: ArpRate
  /** Tempo in beats per minute (30..240) */
  bpm: number
  /** Note-on to note-off as a fraction of step duration (0.05..1) */
  gate: number
  /** 0 = straight, >0 delays every other step (0..0.5 internal; UI shows %) */
  swing: number
  /** How many octaves the arp spans (1..4) */
  octaves: number
  /** When true, released keys stay in the arp's held chord until latch is turned off
   *  or a fresh chord is pressed after all physical keys have been released. */
  latch: boolean
  /** When true, use the step pattern to determine rests / accents / octave offsets. */
  usePattern: boolean
  /** How many steps of `pattern` to cycle through (1..16). */
  patternLength: number
  pattern: ArpStep[]
}

/**
 * Per-part patch — everything that's independent between the two parts of a
 * bitimbral setup. Oscillators, envelopes, filters, voice mode. FX, master
 * gain, and the arpeggiator are global (live on SynthPatch) so they apply
 * equally across whatever arrangement of parts is playing.
 */
export interface PartPatch {
  oscillators: [OscillatorPatch, OscillatorPatch, OscillatorPatch]
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
  /** Per-part level 0..1 — used to balance the two parts in Layer/Split mode. */
  level: number
}

export type BiMode = 'single' | 'layer' | 'split'

export interface SynthPatch {
  parts: [PartPatch, PartPatch]
  /** Which part the UI is currently editing (0 = A, 1 = B). Not audio-facing,
   *  but part of the patch so it restores alongside preset loads. */
  activePart: 0 | 1
  bimode: BiMode
  /** MIDI note at and above which Part B plays in 'split' mode. 0..127. */
  splitNote: number
  /** Master gain 0..1 */
  masterGain: number
  fx: FXPatch
  arp: ArpPatch
}

export function defaultPart(): PartPatch {
  return {
    oscillators: [
      { enabled: true, waveform: 'sawtooth', semitones: 0, detune: 0, level: 0.5 },
      { enabled: true, waveform: 'sawtooth', semitones: 0, detune: -7, level: 0.4 },
      { enabled: false, waveform: 'sine', semitones: -12, detune: 0, level: 0.3 },
    ],
    ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.4 },
    filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.3 },
    filter: { enabled: true, type: 'lowpass', cutoff: 1200, resonance: 2, envAmount: 3000 },
    filter2: { enabled: false, type: 'highpass', cutoff: 200, resonance: 1, envAmount: 0 },
    filterRouting: 'series',
    voiceMode: 'poly',
    glide: 0,
    notePriority: 'last',
    legato: false,
    level: 1,
  }
}

export function defaultPatch(): SynthPatch {
  return {
    parts: [defaultPart(), defaultPart()],
    activePart: 0,
    bimode: 'single',
    splitNote: 60, // middle C
    masterGain: 0.6,
    fx: {
      reverb: { enabled: false, decay: 2.0, mix: 0.3 },
      delay: { enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 },
    },
    arp: {
      enabled: false,
      mode: 'up',
      rate: '1/16',
      bpm: 120,
      gate: 0.7,
      swing: 0,
      octaves: 1,
      latch: false,
      usePattern: false,
      patternLength: 8,
      pattern: Array.from({ length: 16 }, () => ({ active: true, octave: 0, velocityMul: 1 })),
    },
  }
}

export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

/** Legacy flat patch shape — preserved so old preset files can be migrated
 *  when imported. */
export interface LegacySynthPatch {
  oscillators: OscillatorPatch[]
  masterGain: number
  ampEnvelope: EnvelopePatch
  filterEnvelope: EnvelopePatch
  filter: FilterPatch
  filter2: FilterPatch
  filterRouting: FilterRouting
  voiceMode: VoiceMode
  glide: number
  notePriority: NotePriority
  legato: boolean
  fx: FXPatch
  arp: ArpPatch
}

/** Detect and migrate a pre-bitimbral patch to the new shape. Returns the
 *  patch as-is if already new. */
export function migratePatch(raw: unknown): SynthPatch {
  if (raw && typeof raw === 'object' && 'parts' in raw) {
    return raw as SynthPatch
  }
  const old = raw as LegacySynthPatch
  const partA: PartPatch = {
    oscillators: old.oscillators as PartPatch['oscillators'],
    ampEnvelope: old.ampEnvelope,
    filterEnvelope: old.filterEnvelope,
    filter: old.filter,
    filter2: old.filter2,
    filterRouting: old.filterRouting,
    voiceMode: old.voiceMode,
    glide: old.glide,
    notePriority: old.notePriority,
    legato: old.legato,
    level: 1,
  }
  return {
    parts: [partA, defaultPart()],
    activePart: 0,
    bimode: 'single',
    splitNote: 60,
    masterGain: old.masterGain,
    fx: old.fx,
    arp: old.arp,
  }
}
