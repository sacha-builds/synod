import { defaultPatch, type SynthPatch } from './types'
import type { SynodPreset } from './presets'

/** Mutate a fresh defaultPatch and return it. The callback edits the primary
 *  (Part A) side of the patch — shorthand for the common case where a preset
 *  is a single-timbre sound. For Layer/Split presets, mutate both parts. */
function make(fn: (p: SynthPatch) => void): SynthPatch {
  const p = defaultPatch()
  fn(p)
  return p
}

export const FACTORY_PRESETS: SynodPreset[] = [
  {
    id: 'factory:init',
    name: 'Init',
    builtin: true,
    patch: defaultPatch(),
  },

  {
    id: 'factory:votive-pad',
    name: 'Votive Pad',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'sawtooth'
      a.oscillators[0].level = 0.45
      a.oscillators[1].waveform = 'sawtooth'
      a.oscillators[1].detune = -11
      a.oscillators[1].level = 0.4
      a.oscillators[2].enabled = true
      a.oscillators[2].waveform = 'sine'
      a.oscillators[2].semitones = -12
      a.oscillators[2].level = 0.35
      a.ampEnvelope = { attack: 1.4, decay: 0.8, sustain: 0.85, release: 3.0 }
      a.filterEnvelope = { attack: 1.6, decay: 1.0, sustain: 0.5, release: 2.0 }
      a.filter.cutoff = 900
      a.filter.resonance = 1.4
      a.filter.envAmount = 2200
      p.fx.reverb.enabled = true
      p.fx.reverb.decay = 4.5
      p.fx.reverb.mix = 0.5
    }),
  },

  {
    id: 'factory:offering',
    name: 'Offering',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'sawtooth'
      a.oscillators[0].level = 0.55
      a.oscillators[1].waveform = 'square'
      a.oscillators[1].semitones = 0
      a.oscillators[1].detune = 6
      a.oscillators[1].level = 0.35
      a.oscillators[2].enabled = false
      a.ampEnvelope = { attack: 0.005, decay: 0.35, sustain: 0.3, release: 0.5 }
      a.filterEnvelope = { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.3 }
      a.filter.cutoff = 1400
      a.filter.resonance = 5
      a.filter.envAmount = 5500
      a.voiceMode = 'mono'
      a.glide = 0.04
      p.fx.delay.enabled = true
      p.fx.delay.time = 0.28
      p.fx.delay.feedback = 0.35
      p.fx.delay.mix = 0.28
    }),
  },

  {
    id: 'factory:incense-bass',
    name: 'Incense Bass',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'sawtooth'
      a.oscillators[0].semitones = -12
      a.oscillators[0].level = 0.7
      a.oscillators[1].waveform = 'square'
      a.oscillators[1].semitones = -12
      a.oscillators[1].detune = -5
      a.oscillators[1].level = 0.4
      a.oscillators[2].enabled = false
      a.ampEnvelope = { attack: 0.002, decay: 0.28, sustain: 0.55, release: 0.22 }
      a.filterEnvelope = { attack: 0.001, decay: 0.22, sustain: 0.08, release: 0.18 }
      a.filter.cutoff = 400
      a.filter.resonance = 6
      a.filter.envAmount = 3600
      a.voiceMode = 'mono'
      a.glide = 0.02
    }),
  },

  {
    id: 'factory:nave',
    name: 'Nave',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'triangle'
      a.oscillators[0].level = 0.4
      a.oscillators[1].waveform = 'sawtooth'
      a.oscillators[1].detune = 4
      a.oscillators[1].level = 0.3
      a.oscillators[2].enabled = true
      a.oscillators[2].waveform = 'triangle'
      a.oscillators[2].semitones = 7
      a.oscillators[2].detune = -3
      a.oscillators[2].level = 0.3
      a.ampEnvelope = { attack: 3.5, decay: 1.0, sustain: 1.0, release: 5.0 }
      a.filterEnvelope = { attack: 4.0, decay: 2.0, sustain: 0.6, release: 3.0 }
      a.filter.cutoff = 600
      a.filter.resonance = 2.5
      a.filter.envAmount = 3500
      a.filter2.enabled = true
      a.filter2.type = 'highpass'
      a.filter2.cutoff = 80
      p.fx.reverb.enabled = true
      p.fx.reverb.decay = 6.5
      p.fx.reverb.mix = 0.6
      p.fx.delay.enabled = true
      p.fx.delay.time = 0.52
      p.fx.delay.feedback = 0.45
      p.fx.delay.mix = 0.25
    }),
  },

  {
    id: 'factory:procession',
    name: 'Procession',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'sawtooth'
      a.oscillators[0].level = 0.5
      a.oscillators[1].waveform = 'square'
      a.oscillators[1].semitones = -12
      a.oscillators[1].detune = 7
      a.oscillators[1].level = 0.35
      a.oscillators[2].enabled = false
      a.ampEnvelope = { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.35 }
      a.filterEnvelope = { attack: 0.003, decay: 0.25, sustain: 0.2, release: 0.2 }
      a.filter.cutoff = 1100
      a.filter.resonance = 3.5
      a.filter.envAmount = 4200
      p.fx.delay.enabled = true
      p.fx.delay.time = 0.22
      p.fx.delay.feedback = 0.4
      p.fx.delay.mix = 0.3
      p.arp.enabled = true
      p.arp.mode = 'updown'
      p.arp.rate = '1/16'
      p.arp.bpm = 110
      p.arp.octaves = 2
      p.arp.gate = 0.55
    }),
  },

  {
    id: 'factory:reliquary',
    name: 'Reliquary',
    builtin: true,
    patch: make((p) => {
      const a = p.parts[0]
      a.oscillators[0].waveform = 'sawtooth'
      a.oscillators[0].level = 0.5
      a.oscillators[1].waveform = 'sawtooth'
      a.oscillators[1].detune = -14
      a.oscillators[1].level = 0.45
      a.oscillators[2].enabled = true
      a.oscillators[2].waveform = 'sawtooth'
      a.oscillators[2].detune = 17
      a.oscillators[2].level = 0.4
      a.ampEnvelope = { attack: 0.02, decay: 0.5, sustain: 0.8, release: 1.2 }
      a.filterEnvelope = { attack: 0.08, decay: 1.0, sustain: 0.4, release: 0.9 }
      a.filter.type = 'allpass'
      a.filter.cutoff = 900
      a.filter.resonance = 4
      a.filter.envAmount = 3200
      a.filter2.enabled = true
      a.filter2.type = 'lowpass'
      a.filter2.cutoff = 4500
      a.filter2.resonance = 1.5
      a.filterRouting = 'series'
      p.fx.reverb.enabled = true
      p.fx.reverb.decay = 3.0
      p.fx.reverb.mix = 0.35
    }),
  },

  // A dual-patch starter demonstrating Layer mode.
  {
    id: 'factory:vespers-layer',
    name: 'Vespers (Layer)',
    builtin: true,
    patch: make((p) => {
      p.bimode = 'layer'
      // Part A — a bell-like high shimmer
      const a = p.parts[0]
      a.oscillators[0].waveform = 'triangle'
      a.oscillators[0].semitones = 12
      a.oscillators[0].level = 0.4
      a.oscillators[1].waveform = 'sine'
      a.oscillators[1].semitones = 19
      a.oscillators[1].level = 0.3
      a.oscillators[2].enabled = false
      a.ampEnvelope = { attack: 0.005, decay: 1.8, sustain: 0, release: 0.8 }
      a.filterEnvelope = { attack: 0.002, decay: 0.6, sustain: 0, release: 0.4 }
      a.filter.cutoff = 3500
      a.filter.resonance = 0.8
      a.filter.envAmount = 0
      a.level = 0.6
      // Part B — a warm sustained pad underneath
      const b = p.parts[1]
      b.oscillators[0].waveform = 'sawtooth'
      b.oscillators[0].level = 0.4
      b.oscillators[1].waveform = 'sawtooth'
      b.oscillators[1].detune = -9
      b.oscillators[1].level = 0.4
      b.oscillators[2].enabled = true
      b.oscillators[2].waveform = 'triangle'
      b.oscillators[2].semitones = -12
      b.oscillators[2].level = 0.3
      b.ampEnvelope = { attack: 1.2, decay: 0.6, sustain: 0.85, release: 2.0 }
      b.filterEnvelope = { attack: 1.5, decay: 1.0, sustain: 0.5, release: 1.5 }
      b.filter.cutoff = 850
      b.filter.resonance = 1.2
      b.filter.envAmount = 1500
      b.level = 0.8
      p.fx.reverb.enabled = true
      p.fx.reverb.decay = 5.0
      p.fx.reverb.mix = 0.5
    }),
  },
]
