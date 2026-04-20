<script setup lang="ts">
import type { NotePriority, SynthPatch, VoiceMode } from '../audio/types'
import Knob from './Knob.vue'

defineProps<{ patch: SynthPatch }>()

const modes: { id: VoiceMode; label: string; hint: string }[] = [
  { id: 'mono', label: 'MONO', hint: 'One voice, new notes steal the previous' },
  { id: 'para', label: 'PARA', hint: 'Multiple notes share one filter + amp envelope' },
  { id: 'poly', label: 'POLY', hint: 'Each note is an independent voice' },
]

const priorities: { id: NotePriority; label: string; hint: string }[] = [
  { id: 'last', label: 'LAST', hint: 'Most recently pressed note wins' },
  { id: 'low', label: 'LOW', hint: 'Lowest held note wins' },
  { id: 'high', label: 'HIGH', hint: 'Highest held note wins' },
]

const fmtTime = (v: number) => {
  if (v < 0.01) return 'OFF'
  if (v < 1) return (v * 1000).toFixed(0) + 'ms'
  return v.toFixed(2) + 's'
}
</script>

<template>
  <div class="panel voice-panel">
    <h3 class="panel-title">Voice</h3>

    <div class="mode-row">
      <button
        v-for="m in modes"
        :key="m.id"
        class="mode"
        :class="{ active: patch.voiceMode === m.id, disabled: m.id === 'para' }"
        :disabled="m.id === 'para'"
        @click="patch.voiceMode = m.id"
        :title="m.id === 'para' ? 'Paraphonic — coming soon' : m.hint"
      >
        {{ m.label }}
      </button>
    </div>

    <transition name="slide">
      <div v-if="patch.voiceMode === 'mono'" class="mono-row">
        <div class="glide-cell">
          <Knob v-model="patch.glide" :min="0" :max="2" curve="exp" label="GLIDE" :format="fmtTime" />
        </div>
        <div class="prio-cell">
          <div class="sub-label">PRIORITY</div>
          <div class="prio-row">
            <button
              v-for="p in priorities"
              :key="p.id"
              class="prio"
              :class="{ active: patch.notePriority === p.id }"
              @click="patch.notePriority = p.id"
              :title="p.hint"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <label class="legato" :title="'Hold a new note while another is held — envelope stays open'">
          <input type="checkbox" v-model="patch.legato" />
          <span>LEGATO</span>
        </label>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.voice-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mode-row {
  display: flex;
  gap: 4px;
}
.mode {
  flex: 1;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  border-radius: 3px;
}
.mode.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}
.mode.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.mono-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid var(--line);
}
.glide-cell {
  flex: 0 0 auto;
}
.prio-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 140px;
}
.sub-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-faint);
}
.prio-row {
  display: flex;
  gap: 4px;
}
.prio {
  flex: 1;
  padding: 5px 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  border-radius: 3px;
}
.prio.active {
  color: var(--accent-hi);
  background: var(--accent-dim);
  border-color: var(--accent);
}
.legato {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  cursor: pointer;
}
.legato input {
  accent-color: var(--accent);
}

@media (max-width: 520px) {
  .mono-row {
    flex-wrap: wrap;
    gap: 12px;
  }
  .prio-cell {
    flex: 1 1 100%;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 180ms var(--ease-out), max-height 180ms var(--ease-out);
  max-height: 300px;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
