<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'
import { useScheduleStore } from '@/stores/scheduleStore'

const props = defineProps({
  breakdown: { type: Array, required: true }, // [{ type, hours, pct }], sorted desc
})

const store = useScheduleStore()

// "OvertimeCompensation" -> "Overtime Compensation" - same label rule
// PlannerView's legend uses.
function formatLabel(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const segments = computed(() =>
  props.breakdown.map((entry, i) => ({
    ...entry,
    label: formatLabel(entry.type),
    ...colorStyleForType(entry.type, store.entryTypeColors),
    index: i,
  })),
)
</script>

<template>
  <div class="breakdown">
    <div class="stacked-bar">
      <span
        v-for="seg in segments"
        :key="seg.type"
        class="segment"
        :style="{ width: seg.pct + '%', background: seg.bg, animationDelay: seg.index * 90 + 'ms' }"
        :title="`${seg.label} · ${formatHours(seg.hours)}`"
      ></span>
    </div>
    <div v-if="segments.length === 0" class="empty-state">No tracked time yet.</div>
    <div v-else class="legend">
      <div v-for="seg in segments" :key="seg.type" class="legend-row">
        <span class="legend-left">
          <span class="legend-swatch" :style="{ background: seg.bg, borderColor: seg.border }"></span>{{ seg.label }}
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
  border: 1px solid;
}

.legend-total {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg);
}
</style>
