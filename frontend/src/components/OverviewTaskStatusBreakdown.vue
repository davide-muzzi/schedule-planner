<script setup>
import { computed } from 'vue'

const props = defineProps({
  counts: { type: Object, required: true }, // { open, inProgress, done }
})

// Same reading order TasksView groups status sections in - work in progress
// first, then what's queued, with Done last.
const STATUS_ORDER = ['inProgress', 'open', 'done']
const STATUS_LABELS = { inProgress: 'In Progress', open: 'Not started', done: 'Done' }
// Reuses the exact colors TasksView's status badges already use for these
// three states, so a status means the same color everywhere in the app
// instead of the chart inventing its own categorical palette.
const STATUS_COLORS = { inProgress: 'var(--accent)', open: 'var(--mute)', done: 'var(--ok)' }

// The "r ~= 15.915" trick: circumference = 2*pi*r = 100, so a percentage
// maps directly onto stroke-dasharray/stroke-dashoffset with no trig.
const RADIUS = 15.91549430919

const total = computed(() => props.counts.open + props.counts.inProgress + props.counts.done)

const segments = computed(() => {
  let cumulativePercent = 0
  return STATUS_ORDER.map((status) => {
    const count = props.counts[status] ?? 0
    const percent = total.value > 0 ? (count / total.value) * 100 : 0
    // Dasharray starts at the 3 o'clock point by default - offsetting by 25
    // (a quarter of the 100-unit circumference) rotates the start to 12
    // o'clock, then each segment's offset shifts back by everything before it.
    const segment = { status, count, percent, offset: 25 - cumulativePercent, color: STATUS_COLORS[status] }
    cumulativePercent += percent
    return segment
  })
})

const legendRows = computed(() =>
  STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
    count: props.counts[status] ?? 0,
  })),
)
</script>

<template>
  <div class="status-breakdown">
    <div v-if="total === 0" class="empty-state">No tasks yet.</div>
    <template v-else>
      <div class="donut-wrap">
        <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Task status breakdown">
          <circle class="donut-track" cx="21" cy="21" r="15.91549430919" fill="transparent" />
          <circle
            v-for="seg in segments"
            :key="seg.status"
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
        <div v-for="row in legendRows" :key="row.status" class="legend-row">
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
.status-breakdown {
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
