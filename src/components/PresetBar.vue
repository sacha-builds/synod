<script setup lang="ts">
import { computed, ref } from 'vue'

interface PresetListItem {
  id: string
  name: string
  builtin?: boolean
}

const props = defineProps<{
  presets: PresetListItem[]
  currentId: string | null
  isDirty: boolean
}>()

const emit = defineEmits<{
  load: [id: string]
  prev: []
  next: []
  save: []
  saveAs: []
  rename: []
  remove: []
  exportPreset: []
  importPreset: [file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const currentPreset = computed(() => props.presets.find((p) => p.id === props.currentId) ?? null)
const currentIsBuiltin = computed(() => currentPreset.value?.builtin === true)
const displayName = computed(() => {
  if (!currentPreset.value) return 'Untitled'
  return props.isDirty ? `${currentPreset.value.name} *` : currentPreset.value.name
})

function onSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (id) emit('load', id)
}

function onImportClick() {
  fileInput.value?.click()
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importPreset', file)
  input.value = ''
}
</script>

<template>
  <div class="preset-bar">
    <div class="selector">
      <button class="nav-btn" title="Previous preset" @click="emit('prev')">◀</button>
      <div class="select-wrap">
        <select :value="currentId ?? ''" @change="onSelect" class="preset-select">
          <option v-if="!currentId" value="" disabled>{{ displayName }}</option>
          <optgroup label="Factory">
            <option
              v-for="p in presets.filter((p) => p.builtin)"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </optgroup>
          <optgroup label="User" v-if="presets.some((p) => !p.builtin)">
            <option
              v-for="p in presets.filter((p) => !p.builtin)"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </optgroup>
        </select>
        <span class="display" :class="{ dirty: isDirty }">
          {{ displayName }}
          <span class="caret">▾</span>
        </span>
      </div>
      <button class="nav-btn" title="Next preset" @click="emit('next')">▶</button>
    </div>

    <div class="actions">
      <button
        class="action"
        :disabled="!currentPreset || currentIsBuiltin"
        title="Save changes to this preset (user presets only)"
        @click="emit('save')"
      >
        SAVE
      </button>
      <button class="action" title="Save current patch as a new preset" @click="emit('saveAs')">
        SAVE AS
      </button>
      <button
        class="action"
        :disabled="!currentPreset || currentIsBuiltin"
        title="Rename this preset (user presets only)"
        @click="emit('rename')"
      >
        RENAME
      </button>
      <button
        class="action"
        :disabled="!currentPreset"
        title="Export current preset to a file"
        @click="emit('exportPreset')"
      >
        EXPORT
      </button>
      <button class="action" title="Load a preset file" @click="onImportClick">IMPORT</button>
      <button
        class="action danger"
        :disabled="!currentPreset || currentIsBuiltin"
        title="Delete this preset (user presets only)"
        @click="emit('remove')"
      >
        DELETE
      </button>
    </div>

    <input ref="fileInput" type="file" accept=".json,application/json" @change="onFilePicked" hidden />
  </div>
</template>

<style scoped>
.preset-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.selector {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 180px;
}
.nav-btn {
  padding: 6px 8px;
  font-size: 10px;
  color: var(--text-dim);
  border-radius: 3px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .nav-btn:hover {
    color: var(--accent-hi);
    border-color: var(--line-hi);
  }
}

.select-wrap {
  position: relative;
  flex: 1;
  min-width: 140px;
}
.preset-select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: inherit;
}
.display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  pointer-events: none;
  min-height: 30px;
}
.display.dirty {
  color: var(--accent-hi);
  border-color: var(--accent-dim);
}
.caret {
  font-size: 9px;
  color: var(--text-faint);
}

.actions {
  display: flex;
  flex: 1;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.action {
  padding: 6px 10px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  border-radius: 3px;
  -webkit-tap-highlight-color: transparent;
}
.action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
@media (hover: hover) {
  .action:not(:disabled):hover {
    color: var(--accent-hi);
    border-color: var(--accent);
  }
}
.action:active:not(:disabled) {
  transform: scale(0.97);
}
.action.danger:not(:disabled) {
  color: #d88;
}
@media (hover: hover) {
  .action.danger:not(:disabled):hover {
    color: #fff;
    background: var(--danger);
    border-color: var(--danger);
  }
}

@media (max-width: 640px) {
  .preset-bar {
    gap: 8px;
    padding: 6px 10px;
  }
  .actions {
    justify-content: center;
  }
  .action {
    padding: 5px 7px;
    font-size: 8px;
    letter-spacing: 0.1em;
  }
}
</style>
