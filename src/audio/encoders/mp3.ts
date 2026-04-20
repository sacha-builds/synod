/**
 * Encode stereo Float32 PCM to an MP3 blob. Lazy-loads the lamejs fork so
 * the ~50KB encoder only downloads when a user actually exports MP3 —
 * people who only use WAV don't pay for it.
 */
export async function encodeMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bitrateKbps = 192,
): Promise<Blob> {
  const lamejs = await import('@breezystack/lamejs')

  const leftI16 = floatToInt16(left)
  const rightI16 = floatToInt16(right)

  const encoder = new lamejs.Mp3Encoder(2, sampleRate, bitrateKbps)
  const sampleBlockSize = 1152 // MP3 frame size
  const chunks: BlobPart[] = []

  for (let i = 0; i < leftI16.length; i += sampleBlockSize) {
    const l = leftI16.subarray(i, i + sampleBlockSize)
    const r = rightI16.subarray(i, i + sampleBlockSize)
    const buf = encoder.encodeBuffer(l, r)
    if (buf.length > 0) chunks.push(buf)
  }
  const final = encoder.flush()
  if (final.length > 0) chunks.push(final)

  return new Blob(chunks, { type: 'audio/mpeg' })
}

function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
