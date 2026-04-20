// Import the worklet source as a URL. Vite bundles the .js file and
// returns a hashed URL we can pass to ctx.audioWorklet.addModule().
import workletUrl from './recorderWorklet.js?url'

/**
 * Taps the synth's master output via an AudioWorkletNode. The worklet
 * forwards raw PCM to the main thread only while active; on stop the
 * collected sample buffer is returned for an encoder to package.
 */
export class Recorder {
  private ctx: AudioContext
  private source: AudioNode
  private node: AudioWorkletNode | null = null
  private leftChunks: Float32Array[] = []
  private rightChunks: Float32Array[] = []
  private recording = false
  private startedAt = 0

  constructor(ctx: AudioContext, source: AudioNode) {
    this.ctx = ctx
    this.source = source
  }

  /** Load the worklet and wire up the tap. Call once per Synth lifetime. */
  async init(): Promise<void> {
    if (this.node) return
    await this.ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(this.ctx, 'synod-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })
    node.port.onmessage = (e) => this.onSamples(e.data as Float32Array[])
    this.source.connect(node)
    this.node = node
  }

  get isRecording(): boolean {
    return this.recording
  }

  /** Seconds since start, or 0 when idle. */
  elapsedSeconds(): number {
    if (!this.recording) return 0
    return this.ctx.currentTime - this.startedAt
  }

  start(): void {
    if (!this.node || this.recording) return
    this.leftChunks = []
    this.rightChunks = []
    this.startedAt = this.ctx.currentTime
    this.recording = true
    this.node.port.postMessage({ type: 'setActive', active: true })
  }

  /** Stop recording and return the collected stereo PCM + sample rate. */
  stop(): { left: Float32Array; right: Float32Array; sampleRate: number; durationSec: number } | null {
    if (!this.node || !this.recording) return null
    this.recording = false
    this.node.port.postMessage({ type: 'setActive', active: false })
    const durationSec = this.ctx.currentTime - this.startedAt
    const left = concat(this.leftChunks)
    // If the output is mono (single channel), mirror it to right for a stereo file.
    const right = this.rightChunks.length > 0 ? concat(this.rightChunks) : left
    this.leftChunks = []
    this.rightChunks = []
    return { left, right, sampleRate: this.ctx.sampleRate, durationSec }
  }

  private onSamples(channels: Float32Array[]): void {
    if (!this.recording) return
    if (!channels[0]) return
    this.leftChunks.push(channels[0])
    if (channels[1]) this.rightChunks.push(channels[1])
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
