import type { ArpMode, ArpPatch, ArpRate } from './types'

export interface ArpCallbacks {
  /** Called when the arp wants a voice triggered. */
  noteOn: (note: number, velocity: number) => void
  /** Called when the arp wants a voice released. */
  noteOff: (note: number) => void
}

/**
 * Precise-timing arpeggiator using the AudioContext clock as the master
 * reference. A lookahead scheduler runs on setTimeout every ~25ms, looking
 * 100ms into the future and queuing any steps that should fire before then.
 * Step triggers go through setTimeout with a delay computed against
 * ctx.currentTime, so drift stays minimal regardless of JS event-loop jitter.
 *
 * The synth's noteOn/noteOff aren't individually time-schedulable (they
 * create oscillator nodes in real time), so we can't use the canonical
 * "schedule audio events ahead" form of the pattern. Instead we fire each
 * note-on/note-off via a setTimeout that's computed relative to
 * ctx.currentTime at the moment of queueing. In practice that adds a few
 * ms of jitter per step — plenty tight for an arp.
 */
export class Arp {
  private ctx: AudioContext
  private cb: ArpCallbacks
  patch: ArpPatch

  /** Held notes — what the arp is cycling through. Maintained as a set for
   *  O(1) add/remove, plus a sorted-ascending array the pick function uses. */
  private held = new Set<number>()
  private sorted: number[] = []
  /** Notes played in physical-press order — used by `order` mode. */
  private playOrder: number[] = []

  private running = false
  private nextStepTime = 0
  private stepIndex = 0
  private schedTimer: number | null = null
  private pendingTimeouts = new Set<number>()
  /** Notes currently sounding from the arp, so stop() can release them. */
  private sounding = new Set<number>()

  /** Flag set when physical keys are all released while latch is active. The
   *  next addHeldNote will clear the held set first — i.e. "new chord". */
  private latchReset = false

  constructor(ctx: AudioContext, patch: ArpPatch, cb: ArpCallbacks) {
    this.ctx = ctx
    this.patch = patch
    this.cb = cb
  }

  /** A physical note was pressed. Add it to the arp's held chord and start
   *  the scheduler if it's not running yet. */
  addHeldNote(note: number, _velocity: number): void {
    if (this.latchReset) {
      this.clearHeld()
      this.latchReset = false
    }
    if (this.held.has(note)) return
    this.held.add(note)
    this.playOrder.push(note)
    this.resort()
    if (!this.running) this.start()
  }

  /** A physical note was released. If latch is off, remove from held set. */
  removeHeldNote(note: number): void {
    this.held.delete(note)
    this.playOrder = this.playOrder.filter((n) => n !== note)
    this.resort()
    if (this.held.size === 0) this.stop()
  }

  /** Called by App.vue when latch is on and all physical keys have been
   *  released. The next pressed note will start a fresh chord. */
  markLatchReset(): void {
    this.latchReset = true
  }

  /** Drop all held notes and stop the scheduler. Used when arp or latch is
   *  toggled off. */
  clearHeld(): void {
    this.held.clear()
    this.playOrder = []
    this.sorted = []
    this.latchReset = false
    this.stop()
  }

  /** Called when the enabled flag changes to false — release everything. */
  shutdown(): void {
    this.clearHeld()
  }

  private resort(): void {
    this.sorted = [...this.held].sort((a, b) => a - b)
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.stepIndex = 0
    // Start a hair in the future so we never miss the first step to lookahead jitter.
    this.nextStepTime = this.ctx.currentTime + 0.04
    this.runScheduler()
  }

  private stop(): void {
    this.running = false
    if (this.schedTimer !== null) {
      clearTimeout(this.schedTimer)
      this.schedTimer = null
    }
    for (const id of this.pendingTimeouts) clearTimeout(id)
    this.pendingTimeouts.clear()
    // Release any notes we'd scheduled to be sounding right now.
    for (const note of this.sounding) this.cb.noteOff(note)
    this.sounding.clear()
  }

  private runScheduler(): void {
    const lookahead = 0.1 // seconds to look ahead
    const interval = 25 // ms between scheduler ticks
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.nextStepTime)
      this.advance()
    }
    if (this.running) {
      this.schedTimer = window.setTimeout(() => this.runScheduler(), interval)
    }
  }

  private scheduleStep(absTime: number): void {
    if (this.sorted.length === 0) return

    // Resolve the step pattern overlay (active / octave / accent).
    let active = true
    let octaveShift = 0
    let velocityMul = 1
    if (this.patch.usePattern) {
      const p = this.patch.pattern[this.stepIndex % Math.max(1, this.patch.patternLength)]
      if (p) {
        active = p.active
        octaveShift = p.octave
        velocityMul = p.velocityMul
      }
    }
    if (!active) return

    const stepDur = this.stepDuration()
    const gateSec = Math.max(0.005, stepDur * this.patch.gate)
    const delayOnMs = Math.max(0, (absTime - this.ctx.currentTime) * 1000)
    const delayOffMs = delayOnMs + gateSec * 1000

    if (this.patch.mode === 'chord') {
      // Play every held note as a block on each step.
      const velocity = clampVelocity(100 * velocityMul)
      for (const baseNote of this.sorted) {
        this.firePair(baseNote + octaveShift * 12, velocity, delayOnMs, delayOffMs)
      }
      return
    }

    const picked = this.pickNote()
    if (picked === null) return
    const velocity = clampVelocity(100 * velocityMul)
    this.firePair(picked + octaveShift * 12, velocity, delayOnMs, delayOffMs)
  }

  private firePair(note: number, velocity: number, onMs: number, offMs: number): void {
    const onId = window.setTimeout(() => {
      this.pendingTimeouts.delete(onId)
      if (!this.running) return
      this.cb.noteOn(note, velocity)
      this.sounding.add(note)
    }, onMs)
    this.pendingTimeouts.add(onId)

    const offId = window.setTimeout(() => {
      this.pendingTimeouts.delete(offId)
      this.cb.noteOff(note)
      this.sounding.delete(note)
    }, offMs)
    this.pendingTimeouts.add(offId)
  }

  private pickNote(): number | null {
    const sorted = this.sorted
    const len = sorted.length
    if (len === 0) return null
    const octaves = Math.max(1, Math.min(4, this.patch.octaves))
    const total = len * octaves
    const step = this.stepIndex

    switch (this.patch.mode) {
      case 'up': {
        const pos = ((step % total) + total) % total
        return sorted[pos % len] + Math.floor(pos / len) * 12
      }
      case 'down': {
        const pos = ((step % total) + total) % total
        const invertedPos = total - 1 - pos
        return sorted[invertedPos % len] + Math.floor(invertedPos / len) * 12
      }
      case 'updown': {
        if (total <= 1) return sorted[0]
        const cycle = 2 * (total - 1)
        const p = ((step % cycle) + cycle) % cycle
        const linear = p < total ? p : cycle - p
        return sorted[linear % len] + Math.floor(linear / len) * 12
      }
      case 'order': {
        // Play in the order keys were physically pressed.
        const order = this.playOrder
        const orderLen = order.length
        if (orderLen === 0) return null
        const totalOrder = orderLen * octaves
        const pos = ((step % totalOrder) + totalOrder) % totalOrder
        return order[pos % orderLen] + Math.floor(pos / orderLen) * 12
      }
      case 'random': {
        const idx = Math.floor(Math.random() * len)
        const oct = Math.floor(Math.random() * octaves)
        return sorted[idx] + oct * 12
      }
      case 'chord':
        return null // handled in scheduleStep
    }
  }

  private advance(): void {
    // Swing: even-indexed steps (0, 2, ...) get lengthened by +swing, odd steps
    // get shortened by -swing, so pairs straighten back out at every other
    // step. At swing=0 everything is equal.
    const d = this.stepDuration()
    const thisStep = this.stepIndex
    const delta = d * (thisStep % 2 === 0 ? 1 + this.patch.swing : 1 - this.patch.swing)
    this.stepIndex++
    this.nextStepTime += delta
  }

  private stepDuration(): number {
    return rateToSeconds(this.patch.bpm, this.patch.rate)
  }
}

function clampVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)))
}

export function rateToSeconds(bpm: number, rate: ArpRate): number {
  const q = 60 / Math.max(1, bpm) // seconds per quarter note
  switch (rate) {
    case '1/4':
      return q
    case '1/8':
      return q / 2
    case '1/16':
      return q / 4
    case '1/32':
      return q / 8
    case '1/8t':
      return q / 3
    case '1/16t':
      return q / 6
    case '1/8d':
      return q * 0.75
    case '1/16d':
      return q * 0.375
  }
}

export const ARP_MODES: { id: ArpMode; label: string; title: string }[] = [
  { id: 'up', label: 'UP', title: 'Ascending through held notes' },
  { id: 'down', label: 'DOWN', title: 'Descending through held notes' },
  { id: 'updown', label: 'UP-DN', title: 'Ascend then descend; ends do not repeat' },
  { id: 'order', label: 'ORDER', title: 'In the order keys were pressed' },
  { id: 'random', label: 'RAND', title: 'A random held note each step' },
  { id: 'chord', label: 'CHORD', title: 'All held notes together every step' },
]

export const ARP_RATES: { id: ArpRate; label: string }[] = [
  { id: '1/4', label: '1/4' },
  { id: '1/8', label: '1/8' },
  { id: '1/8d', label: '1/8d' },
  { id: '1/8t', label: '1/8t' },
  { id: '1/16', label: '1/16' },
  { id: '1/16d', label: '1/16d' },
  { id: '1/16t', label: '1/16t' },
  { id: '1/32', label: '1/32' },
]
