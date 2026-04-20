import { defaultPatch, type SynthPatch } from './types'
import type { SynodPreset } from './presets'

/** Mutate a fresh defaultPatch and return it. Keeps each preset definition
 *  a thin diff from the baseline. */
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
      p.oscillators[0].waveform = 'sawtooth'
      p.oscillators[0].level = 0.45
      p.oscillators[1].waveform = 'sawtooth'
      p.oscillators[1].detune = -11
      p.oscillators[1].level = 0.4
      p.oscillators[2].enabled = true
      p.oscillators[2].waveform = 'sine'
      p.oscillators[2].semitones = -12
      p.oscillators[2].level = 0.35
      p.ampEnvelope = { attack: 1.4, decay: 0.8, sustain: 0.85, release: 3.0 }
      p.filterEnvelope = { attack: 1.6, decay: 1.0, sustain: 0.5, release: 2.0 }
      p.filter.cutoff = 900
      p.filter.resonance = 1.4
      p.filter.envAmount = 2200
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
      p.oscillators[0].waveform = 'sawtooth'
      p.oscillators[0].level = 0.55
      p.oscillators[1].waveform = 'square'
      p.oscillators[1].semitones = 0
      p.oscillators[1].detune = 6
      p.oscillators[1].level = 0.35
      p.oscillators[2].enabled = false
      p.ampEnvelope = { attack: 0.005, decay: 0.35, sustain: 0.3, release: 0.5 }
      p.filterEnvelope = { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.3 }
      p.filter.cutoff = 1400
      p.filter.resonance = 5
      p.filter.envAmount = 5500
      p.voiceMode = 'mono'
      p.glide = 0.04
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
      p.oscillators[0].waveform = 'sawtooth'
      p.oscillators[0].semitones = -12
      p.oscillators[0].level = 0.7
      p.oscillators[1].waveform = 'square'
      p.oscillators[1].semitones = -12
      p.oscillators[1].detune = -5
      p.oscillators[1].level = 0.4
      p.oscillators[2].enabled = false
      p.ampEnvelope = { attack: 0.002, decay: 0.28, sustain: 0.55, release: 0.22 }
      p.filterEnvelope = { attack: 0.001, decay: 0.22, sustain: 0.08, release: 0.18 }
      p.filter.cutoff = 400
      p.filter.resonance = 6
      p.filter.envAmount = 3600
      p.voiceMode = 'mono'
      p.glide = 0.02
    }),
  },

  {
    id: 'factory:nave',
    name: 'Nave',
    builtin: true,
    patch: make((p) => {
      p.oscillators[0].waveform = 'triangle'
      p.oscillators[0].level = 0.4
      p.oscillators[1].waveform = 'sawtooth'
      p.oscillators[1].detune = 4
      p.oscillators[1].level = 0.3
      p.oscillators[2].enabled = true
      p.oscillators[2].waveform = 'triangle'
      p.oscillators[2].semitones = 7
      p.oscillators[2].detune = -3
      p.oscillators[2].level = 0.3
      p.ampEnvelope = { attack: 3.5, decay: 1.0, sustain: 1.0, release: 5.0 }
      p.filterEnvelope = { attack: 4.0, decay: 2.0, sustain: 0.6, release: 3.0 }
      p.filter.cutoff = 600
      p.filter.resonance = 2.5
      p.filter.envAmount = 3500
      p.filter2.enabled = true
      p.filter2.type = 'highpass'
      p.filter2.cutoff = 80
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
      p.oscillators[0].waveform = 'sawtooth'
      p.oscillators[0].level = 0.5
      p.oscillators[1].waveform = 'square'
      p.oscillators[1].semitones = -12
      p.oscillators[1].detune = 7
      p.oscillators[1].level = 0.35
      p.oscillators[2].enabled = false
      p.ampEnvelope = { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.35 }
      p.filterEnvelope = { attack: 0.003, decay: 0.25, sustain: 0.2, release: 0.2 }
      p.filter.cutoff = 1100
      p.filter.resonance = 3.5
      p.filter.envAmount = 4200
      p.fx.delay.enabled = true
      p.fx.delay.time = 0.22
      p.fx.delay.feedback = 0.4
      p.fx.delay.mix = 0.3
      // Arp setup
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
      p.oscillators[0].waveform = 'sawtooth'
      p.oscillators[0].level = 0.5
      p.oscillators[1].waveform = 'sawtooth'
      p.oscillators[1].detune = -14
      p.oscillators[1].level = 0.45
      p.oscillators[2].enabled = true
      p.oscillators[2].waveform = 'sawtooth'
      p.oscillators[2].detune = 17
      p.oscillators[2].level = 0.4
      p.ampEnvelope = { attack: 0.02, decay: 0.5, sustain: 0.8, release: 1.2 }
      p.filterEnvelope = { attack: 0.08, decay: 1.0, sustain: 0.4, release: 0.9 }
      p.filter.type = 'allpass'
      p.filter.cutoff = 900
      p.filter.resonance = 4
      p.filter.envAmount = 3200
      p.filter2.enabled = true
      p.filter2.type = 'lowpass'
      p.filter2.cutoff = 4500
      p.filter2.resonance = 1.5
      p.filterRouting = 'series'
      p.fx.reverb.enabled = true
      p.fx.reverb.decay = 3.0
      p.fx.reverb.mix = 0.35
    }),
  },
]
