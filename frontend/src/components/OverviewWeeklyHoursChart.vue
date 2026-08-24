<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'
import { weeklyWorkedStatus } from '@/utils/status'

const props = defineProps({
  series: { type: Array, required: true }, // [{ monday, hours }], oldest first
  targetHours: { type: Number, required: true },
})

// Same idea as WeeklyProgressBar's BUFFER_RATIO: the scale runs past the
// target so a bar that exactly hits the goal doesn't fill the plot, leaving
// headroom to show overtime weeks. Derived from the user's own target
// instead of a fixed 48h so the target line stays meaningful at any goal.
const SCALE_RATIO = 1.15
const scaleMaxHours = computed(() => props.targetHours * SCALE_RATIO)
const targetPercent = computed(() => Math.min(100, (props.targetHours / scaleMaxHours.value) * 100))

const bars = computed(() =>
  props.series.map((week, i) => ({
    ...week,
    index: i,
    heightPercent: Math.min(100, (week.hours / scaleMaxHours.value) * 100),
    status: weeklyWorkedStatus(week.hours, props.targetHours),
  })),
)

// A month label sits under the first bar of every month that appears -
// blank slots elsewhere keep every label aligned under its actual bar in
// the equal-width flex row above.
const axisLabels = computed(() => {
  let lastMonth = null
  return props.series.map((week) => {
    const month = week.monday.getMonth()
    const show = month !== lastMonth
    lastMonth = month
    return show ? week.monday.toLocaleString(undefined, { month: 'short' }).toUpperCase() : ''
  })
})
</script>

<template>
  <div class="chart">
    <div class="plot">
      <div class="target-line" :style="{ bottom: targetPercent + '%' }">
        <span class="target-label">TARGET {{ formatHours(targetHours) }}</span>
      </div>
      <div
        v-for="bar in bars"
        :key="bar.monday.getTime()"
        class="bar"
        :class="'status-' + bar.status"
        :style="{ height: bar.heightPercent + '%', animationDelay: bar.index * 18 + 'ms' }"
        :title="`Week of ${bar.monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${formatHours(bar.hours)}`"
      ></div>
    </div>
    <div class="axis-row">
      <span v-for="(label, i) in axisLabels" :key="i" class="axis-label">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  width: 100%;
}

.plot {
  position: relative;
  height: 150px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}

.target-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--line-2);
}

.target-label {
  position: absolute;
  right: 0;
  transform: translateY(-140%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  background: var(--surface);
  padding-right: 6px;
  white-space: nowrap;
}

.bar {
  flex: 1;
  border-radius: var(--r) var(--r) 0 0;
  transform-origin: bottom;
  animation: growY 0.5s var(--ease) both;
  transition: filter 0.15s;
}

.bar:hover {
  filter: brightness(1.25);
}

.bar.status-green {
  background: var(--ok);
}

.bar.status-yellow {
  background: var(--warn);
}

.bar.status-red {
  background: var(--bad);
}

.axis-row {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-top: 7px;
}

.axis-label {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  letter-spacing: 0.1em;
  text-align: center;
}

.axis-label:first-child {
  text-align: left;
}

.axis-label:last-child {
  text-align: right;
}
</style>
