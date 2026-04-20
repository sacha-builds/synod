<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  analyser: AnalyserNode | null
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let rafId = 0
let buffer: Uint8Array = new Uint8Array(0)

function resize() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const rect = c.getBoundingClientRect()
  c.width = rect.width * dpr
  c.height = rect.height * dpr
  const ctx = c.getContext('2d')
  ctx?.scale(dpr, dpr)
}

function draw() {
  const c = canvas.value
  const analyser = props.analyser
  if (!c || !analyser) {
    rafId = requestAnimationFrame(draw)
    return
  }
  const ctx = c.getContext('2d')
  if (!ctx) return
  if (buffer.length !== analyser.fftSize) {
    buffer = new Uint8Array(analyser.fftSize)
  }
  analyser.getByteTimeDomainData(buffer)

  const rect = c.getBoundingClientRect()
  const w = rect.width
  const h = rect.height

  ctx.clearRect(0, 0, w, h)

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()

  // Waveform
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#f5a623'
  ctx.shadowColor = 'rgba(245,166,35,0.4)'
  ctx.shadowBlur = 6
  ctx.beginPath()
  const step = w / buffer.length
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] / 128 - 1
    const y = h / 2 + (v * h) / 2
    if (i === 0) ctx.moveTo(i * step, y)
    else ctx.lineTo(i * step, y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0

  rafId = requestAnimationFrame(draw)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  rafId = requestAnimationFrame(draw)
})

watch(() => props.analyser, resize)

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="scope">
    <canvas ref="canvas" />
    <div class="label">OSCILLOSCOPE</div>
  </div>
</template>

<style scoped>
.scope {
  position: relative;
  background: radial-gradient(ellipse at center, var(--bg-2) 0%, var(--bg-0) 100%);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  height: 140px;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.label {
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-faint);
  pointer-events: none;
}
</style>
