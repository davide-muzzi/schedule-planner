<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'

const props = defineProps({
  breakdown: { type: Array, required: true }, // [{ priority, hours, pct }], sorted desc
})

// Same colors as the priority dots/breakdown donut elsewhere in the app.
const PRIORITY_COLORS = {
  High: 'var(--bad)',
  Medium: 'var(--warn)',
  Low: 'var(--accent)',
  None: 'var(--mute)',
}

const segments = computed(() =>
  props.breakdown.map((entry, i) => ({
    ...entry,
    color: PRIORITY_COLORS[entry.priority],
    index: i,
  })),
)
</script>

<template>
  <div class="breakdown">
    <div class="stacked-bar">
      <span
        v-for="seg in segments"
        :key="seg.priority"
        class="segment"
        :style="{ width: seg.pct + '%', background: seg.color, animationDelay: seg.index * 90 + 'ms' }"
        :title="`${seg.priority} · ${formatHours(seg.hours)}`"
      ></span>
    </div>
    <div v-if="segments.length === 0" class="empty-state">No tracked time yet.</div>
    <div v-else class="legend">
      <div v-for="seg in segments" :key="seg.priority" class="legend-row">
        <span class="legend-left">
          <span class="legend-swatch" :style="{ background: seg.color }"></span>{{ seg.priority }}
        </span>
        <span class="legend-total">{{ formatHours(seg.hours) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stacked-bar {
  display: flex;
  height: 9px;
  border-radius: var(--r);
  overflow: hidden;
  margin-bottom: 16px;
}

.segment {
  transform-origin: left;
  animation: growX 0.6s var(--ease) both;
}

.empty-state {
  font-size: 11.5px;
  color: var(--mute);
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.legend-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dim);
}

.legend-swatch {
  width: 8px;
  height: 8px;
  border-radius: var(--r);
}

.legend-total {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg);
}
</style>
