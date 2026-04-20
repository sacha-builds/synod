<script setup lang="ts">
import type { FilterPatch } from '../audio/types'
import Knob from './Knob.vue'

defineProps<{ filter: FilterPatch }>()

const fmtHz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(2) + 'k' : v.toFixed(0)) + 'Hz'
</script>

<template>
  <div class="panel">
    <h3 class="panel-title">Filter · Lowpass</h3>
    <div class="knobs">
      <Knob v-model="filter.cutoff" :min="20" :max="20000" curve="exp" label="CUTOFF" :format="fmtHz" />
      <Knob v-model="filter.resonance" :min="0.1" :max="20" curve="exp" label="RES" :format="(v) => v.toFixed(1)" />
      <Knob v-model="filter.envAmount" :min="0" :max="10000" curve="exp" label="ENV AMT" :format="fmtHz" />
    </div>
  </div>
</template>

<style scoped>
.knobs {
  display: flex;
  justify-content: space-around;
  gap: 8px;
}
</style>
