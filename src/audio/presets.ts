import type { SynthPatch } from './types'

/**
 * Version stamp for preset files. When the patch schema changes in a
 * breaking way, bump this and add a migration in parsePresetFile.
 */
export const SYNOD_VERSION = 1

export interface SynodPreset {
  /** Stable identifier within this client. Factory presets use `factory:<slug>`. */
  id: string
  name: string
  author?: string
  /** True for bundled factory presets; they can't be overwritten or deleted. */
  builtin?: boolean
  createdAt?: string
  patch: SynthPatch
}

/** The exported JSON structure. Distinct from SynodPreset so we can evolve
 *  the runtime shape without breaking file format compatibility. */
export interface SynodPresetFile {
  synodVersion: number
  name: string
  author?: string
  createdAt?: string
  patch: SynthPatch
}

export function serializePreset(preset: SynodPreset): string {
  const file: SynodPresetFile = {
    synodVersion: SYNOD_VERSION,
    name: preset.name,
    author: preset.author,
    createdAt: preset.createdAt ?? new Date().toISOString(),
    patch: preset.patch,
  }
  return JSON.stringify(file, null, 2)
}

export class PresetParseError extends Error {}

export function parsePresetFile(json: string): SynodPresetFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new PresetParseError('File is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new PresetParseError('Expected a JSON object')
  }
  const o = parsed as Partial<SynodPresetFile>
  if (typeof o.synodVersion !== 'number') {
    throw new PresetParseError('Missing synodVersion — not a Synod preset')
  }
  if (typeof o.name !== 'string' || !o.patch || typeof o.patch !== 'object') {
    throw new PresetParseError('Missing required fields (name, patch)')
  }
  return o as SynodPresetFile
}

// --- LocalStorage persistence for user-created presets ---

const USER_PRESETS_KEY = 'synod:user-presets'
const CURRENT_PRESET_KEY = 'synod:current-preset-id'

export function loadUserPresets(): SynodPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SynodPreset[]
  } catch {
    return []
  }
}

export function saveUserPresets(presets: SynodPreset[]): void {
  try {
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets))
  } catch (e) {
    console.error('[synod] Failed to write user presets to localStorage:', e)
  }
}

export function loadLastPresetId(): string | null {
  try {
    return localStorage.getItem(CURRENT_PRESET_KEY)
  } catch {
    return null
  }
}

export function saveLastPresetId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(CURRENT_PRESET_KEY)
    else localStorage.setItem(CURRENT_PRESET_KEY, id)
  } catch {
    /* ignore */
  }
}

export function generatePresetId(): string {
  return `user-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Slugify a preset name so we can suggest a safe default filename. */
export function presetFileName(preset: SynodPreset): string {
  const slug = preset.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'preset'
  return `${slug}.synod.json`
}
