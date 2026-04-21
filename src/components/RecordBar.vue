<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type RecordFormat = 'wav' | 'mp3' | 'ogg'

const props = defineProps<{
  isRecording: boolean
  /** Seconds since recording started, 0 when idle. Updated by the parent. */
  elapsed: number
}>()

const emit = defineEmits<{
  start: [format: RecordFormat]
  stop: []
}>()

const format = ref<RecordFormat>('wav')
const pulse = ref(false)

// Blink the REC dot while recording.
let pulseTimer: number | null = null
watch(
  () => props.isRecording,
  (rec) => {
    if (rec) {
      pulseTimer = window.setInterval(() => {
        pulse.value = !pulse.value
      }, 500)
    } else if (pulseTimer !== null) {
      clearInterval(pulseTimer)
      pulseTimer = null
      pulse.value = false
    }
  },
)
onBeforeUnmount(() => {
  if (pulseTimer !== null) clearInterval(pulseTimer)
})

const timeString = computed(() => {
  const sec = Math.max(0, Math.floor(props.elapsed))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
})

function onClick() {
  if (props.isRecording) emit('stop')
  else emit('start', format.value)
}
</script>

<template>
  <div class="record-bar">
    <button
      class="rec-btn"
      :class="{ recording: isRecording, pulse }"
      :title="isRecording ? 'Stop recording' : 'Start recording'"
      @click="onClick"
    >
      <span v-if="!isRecording" class="dot" />
      <span v-else class="square" />
      {{ isRecording ? 'STOP' : 'REC' }}
    </button>

    <span class="time" :class="{ live: isRecording }">{{ timeString }}</span>

    <div class="format-wrap">
      <span class="label">FORMAT</span>
      <div class="format-buttons">
        <button
          class="fmt"
          :class="{ active: format === 'wav' }"
          :disabled="isRecording"
          @click="format = 'wav'"
          title="Uncompressed 16-bit PCM, always supported"
        >
          WAV
        </button>
        <button
          class="fmt"
          :class="{ active: format === 'mp3' }"
          :disabled="isRecording"
          @click="format = 'mp3'"
          title="MP3 at 192 kbps — encoder loads on first use"
        >
          MP3
        </button>
        <button
          class="fmt"
          :class="{ active: format === 'ogg' }"
          :disabled="isRecording"
          @click="format = 'ogg'"
          title="Compressed OGG/WebM/M4A (browser-native codec; container depends on browser)"
        >
          OGG
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.record-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 12px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
  flex-wrap: wrap;
}

.rec-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #f6b3b0;
  background: #2a1010;
  border: 1px solid #6a2020;
  border-radius: 4px;
  transition: all 100ms var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.rec-btn .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger);
}
.rec-btn .square {
  width: 9px;
  height: 9px;
  background: #fff;
}
@media (hover: hover) {
  .rec-btn:not(:disabled):hover {
    color: #fff;
    background: var(--danger);
    border-color: var(--danger);
  }
}
.rec-btn.recording {
  color: #fff;
  background: var(--danger);
  border-color: var(--danger);
  box-shadow: 0 0 10px rgba(217, 83, 79, 0.5);
}
.rec-btn.recording.pulse {
  box-shadow: 0 0 16px rgba(217, 83, 79, 0.9);
}
.rec-btn:focus { outline: none; }
.rec-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.time {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 0.1em;
  min-width: 54px;
}
.time.live {
  color: var(--danger);
}

.format-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-faint);
}
.format-buttons {
  display: flex;
  gap: 3px;
}
.fmt {
  padding: 5px 10px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  border-radius: 3px;
  font-family: var(--font-mono);
}
.fmt:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.fmt.active:not(:disabled) {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}

@media (max-width: 640px) {
  .record-bar {
    gap: 10px;
    padding: 6px 10px;
  }
}
</style>
