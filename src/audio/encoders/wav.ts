/**
 * Encode stereo Float32 PCM into a 16-bit PCM WAV blob. Simple RIFF/WAVE
 * header followed by interleaved little-endian samples.
 */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const length = Math.min(left.length, right.length)
  const numChannels = 2
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = length * numChannels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    const l = clamp(left[i])
    const r = clamp(right[i])
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true)
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true)
    offset += 4
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function clamp(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}
