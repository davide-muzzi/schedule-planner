<script setup>
import { computed } from 'vue'

const props = defineProps({
  counts: { type: Object, required: true }, // { none, low, medium, high }
})

// Most severe first, with "none" last - same visual weighting as the
// priority dots elsewhere in the app (High = red, ... None = grey).
const PRIORITY_ORDER = ['high', 'medium', 'low', 'none']
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' }
// Reuses the same priority-dot colors used across TaskCard/TaskFormModal.
const PRIORITY_COLORS = {
  high: 'var(--bad)',
  medium: 'var(--warn)',
  low: 'var(--accent)',
  none: 'var(--mute)',
}

// The "r ~= 15.915" trick: circumference = 2*pi*r = 100, so a percentage
// maps directly onto stroke-dasharray/stroke-dashoffset with no trig.
const RADIUS = 15.91549430919

const total = computed(
  () => props.counts.none + props.counts.low + props.counts.medium + props.counts.high,
)

const segments = computed(() => {
  let cumulativePercent = 0
  return PRIORITY_ORDER.map((priority) => {
    const count = props.counts[priority] ?? 0
    const percent = total.value > 0 ? (count / total.value) * 100 : 0
    // Dasharray starts at the 3 o'clock point by default - offsetting by 25
    // (a quarter of the 100-unit circumference) rotates the start to 12
    // o'clock, then each segment's offset shifts back by everything before it.
    const segment = { priority, count, percent, offset: 25 - cumulativePercent, color: PRIORITY_COLORS[priority] }
    cumulativePercent += percent
    return segment
  })
})

const legendRows = computed(() =>
  PRIORITY_ORDER.map((priority) => ({
    priority,
    label: PRIORITY_LABELS[priority],
    color: PRIORITY_COLORS[priority],
    count: props.counts[priority] ?? 0,
  })),
)
</script>

<template>
  <div class="priority-breakdown">
    <div v-if="total === 0" class="empty-state">No tasks yet.</div>
    <template v-else>
      <div class="donut-wrap">
        <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Task priority breakdown">
          <circle class="donut-track" cx="21" cy="21" r="15.91549430919" fill="transparent" />
          <circle
            v-for="seg in segments"
            :key="seg.priority"
            class="donut-segment"
            cx="21"
            cy="21"
            :r="RADIUS"
            fill="transparent"
            :stroke="seg.color"
            :stroke-dasharray="`${seg.percent} ${100 - seg.percent}`"
            :stroke-dashoffset="seg.offset"
          />
        </svg>
        <div class="donut-center">
          <span class="donut-total">{{ total }}</span>
          <span class="donut-total-label">tasks</span>
        </div>
      </div>

      <div class="legend">
        <div v-for="row in legendRows" :key="row.priority" class="legend-row">
          <span class="legend-left">
            <span class="legend-swatch" :style="{ background: row.color }"></span>{{ row.label }}
          </span>
          <span class="legend-total">{{ row.count }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.priority-breakdown {
  display: flex;
  align-items: center;
  gap: 22px;
}

.empty-state {
  font-size: 11.5px;
  color: var(--mute);
}

.donut-wrap {
  position: relative;
  flex: none;
  width: 108px;
  height: 108px;
}

.donut {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.donut-track {
  stroke: var(--line);
  stroke-width: 3;
}

.donut-segment {
  stroke-width: 3;
  stroke-linecap: butt;
}

.donut-wrap,
.legend-row {
  animation: fadeUp 0.4s var(--ease) both;
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut-total {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 500;
  color: var(--fg);
}

.donut-total-label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--mute);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 9px;
  flex: 1;
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
