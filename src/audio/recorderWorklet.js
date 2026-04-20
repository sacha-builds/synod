/**
 * AudioWorkletProcessor that taps its input and forwards raw PCM samples
 * to the main thread. Posts one message per render quantum when `active`
 * is true (default true); the main thread toggles it via a `setActive`
 * port message so the processor only allocates / sends during recording.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.active = false
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'setActive') {
        this.active = !!e.data.active
      }
    }
  }

  process(inputs) {
    if (!this.active) return true
    const input = inputs[0]
    if (!input || input.length === 0) return true
    // Copy each channel into a fresh Float32Array so the main thread owns
    // the data (the process() buffers are reused next render quantum).
    const channels = new Array(input.length)
    for (let ch = 0; ch < input.length; ch++) {
      channels[ch] = new Float32Array(input[ch])
    }
    this.port.postMessage(channels)
    return true
  }
}

registerProcessor('synod-recorder', RecorderProcessor)
