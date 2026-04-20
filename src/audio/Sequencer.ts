import { rateToSeconds } from './Arp'
import type { SeqPatch } from './types'

export interface SeqCallbacks {
  /** Trigger a note on the synth. */
  noteOn: (note: number, velocity: number) => void
  /** Release a note on the synth. */
  noteOff: (note: number) => void
  /** Fires at the audible time of each step so the UI cursor can follow. */
  onStep?: (stepIndex: number) => void
}

/**
 * Pattern-based step sequencer. Uses the same Web Audio lookahead scheduler
 * pattern the arp uses — fires steps via setTimeouts computed against
 * ctx.currentTime so timing stays tight even when the JS thread is busy.
 *
 * Patch mutation is picked up on the NEXT step; changes to the currently-
 * playing step don't retroactively apply. Step length is `patch.length`
 * (1..16) of the 16-slot `steps` buffer.
 */
export class Sequencer {
  patch: SeqPatch
  private ctx: AudioContext
  private cb: SeqCallbacks

  private running = false
  private stepIndex = 0
  private nextStepTime = 0
  private schedTimer: number | null = null
  private pendingTimeouts = new Set<number>()
  /** Note currently sounding from the sequencer (release on stop/step). */
  private lastNote: number | null = null
  private lastNoteId = 0

  constructor(ctx: AudioContext, patch: SeqPatch, cb: SeqCallbacks) {
    this.ctx = ctx
    this.patch = patch
    this.cb = cb
  }

  get isPlaying(): boolean {
    return this.running
  }

  play(): void {
    if (this.running) return
    this.running = true
    this.stepIndex = 0
    this.nextStepTime = this.ctx.currentTime + 0.05
    this.runScheduler()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.schedTimer !== null) {
      clearTimeout(this.schedTimer)
      this.schedTimer = null
    }
    for (const id of this.pendingTimeouts) clearTimeout(id)
    this.pendingTimeouts.clear()
    if (this.lastNote !== null) {
      this.cb.noteOff(this.lastNote)
      this.lastNote = null
    }
  }

  private runScheduler(): void {
    const lookahead = 0.1
    const interval = 25
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.nextStepTime)
      this.advance()
    }
    if (this.running) {
      this.schedTimer = window.setTimeout(() => this.runScheduler(), interval)
    }
  }

  private scheduleStep(absTime: number): void {
    const length = Math.max(1, Math.min(16, this.patch.length))
    const idx = this.stepIndex % length
    const step = this.patch.steps[idx]
    const stepDur = this.stepDuration()
    const delayOnMs = Math.max(0, (absTime - this.ctx.currentTime) * 1000)

    // Always fire step indicator so the cursor moves through rests too.
    const stepTickId = window.setTimeout(() => {
      this.pendingTimeouts.delete(stepTickId)
      if (!this.running) return
      this.cb.onStep?.(idx)
    }, delayOnMs)
    this.pendingTimeouts.add(stepTickId)

    if (!step || !step.active) {
      // Rest: release any previous note right at this step time so rests feel distinct.
      if (this.lastNote !== null) {
        const noteToRelease = this.lastNote
        const releaseId = window.setTimeout(() => {
          this.pendingTimeouts.delete(releaseId)
          this.cb.noteOff(noteToRelease)
        }, delayOnMs)
        this.pendingTimeouts.add(releaseId)
        this.lastNote = null
      }
      return
    }

    const gateDur = Math.max(0.005, stepDur * step.gate)
    const delayOffMs = delayOnMs + gateDur * 1000
    const note = step.note
    const velocity = step.velocity

    const onId = window.setTimeout(() => {
      this.pendingTimeouts.delete(onId)
      if (!this.running) return
      if (this.lastNote !== null) this.cb.noteOff(this.lastNote)
      this.cb.noteOn(note, velocity)
      this.lastNote = note
    }, delayOnMs)
    this.pendingTimeouts.add(onId)

    const thisId = ++this.lastNoteId
    const offId = window.setTimeout(() => {
      this.pendingTimeouts.delete(offId)
      // Only release if this specific step's note is still the one sounding;
      // otherwise the next step already advanced us.
      if (this.lastNote === note && this.lastNoteId === thisId) {
        this.cb.noteOff(note)
        this.lastNote = null
      }
    }, delayOffMs)
    this.pendingTimeouts.add(offId)
  }

  private advance(): void {
    this.stepIndex++
    this.nextStepTime += this.stepDuration()
  }

  private stepDuration(): number {
    return rateToSeconds(this.patch.bpm, this.patch.rate)
  }
}
