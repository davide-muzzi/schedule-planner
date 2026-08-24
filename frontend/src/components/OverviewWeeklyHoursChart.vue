<script setup>
import { computed } from 'vue'
import { formatHours, formatWeekRange, getISOWeekNumber } from '@/utils/date'
import { weeklyWorkedStatus } from '@/utils/status'
import { useChartTooltip } from '@/composables/useChartTooltip'
import ChartTooltip from './ChartTooltip.vue'

const props = defineProps({
  series: { type: Array, required: true }, // [{ monday, hours }], oldest first
  targetHours: { type: Number, required: true },
})

// The axis "zooms" to the actual tracked range instead of always starting at
// 0, so a run of weeks that are all within a few hours of each other doesn't
// get flattened into near-identical bar heights. Untracked weeks (0h, most
// of a 52-week window) are excluded from that range - they'd otherwise pin
// the floor back to 0 and defeat the zoom entirely. The target is folded
// into both ends so the dashed target line always stays on-screen even if
// every tracked week is well above or below it. Rounded to the nearest 5h
// (floor for the bottom, ceil for the top) rather than padded further, so
// the tallest/shortest bar sits close to the chart's edge instead of
// leaving empty headroom.
const ROUND_STEP = 5

// Once the lowest week is comfortably above 0, flooring it straight to the
// nearest 5h still puts the floor right under the bars, leaving little room
// to read a dip. Pulling it down another 5h first (only once it's at least
// 40h - below that there isn't the headroom to spare) gives the low end of
// the chart some breathing room too, not just the top.
function roundedMin(rawMin) {
  const base = rawMin >= 40 ? rawMin - 5 : rawMin
  return Math.max(0, Math.floor(base / ROUND_STEP) * ROUND_STEP)
}

const axisRange = computed(() => {
  const tracked = props.series.map((w) => w.hours).filter((h) => h > 0)
  if (tracked.length === 0) {
    return { min: 0, max: Math.ceil((props.targetHours * 1.15) / ROUND_STEP) * ROUND_STEP }
  }
  const rawMin = Math.min(...tracked, props.targetHours)
  const rawMax = Math.max(...tracked, props.targetHours)
  const min = roundedMin(rawMin)
  const max = Math.ceil(rawMax / ROUND_STEP) * ROUND_STEP
  return { min, max: max > min ? max : min + ROUND_STEP }
})

const axisSpan = computed(() => axisRange.value.max - axisRange.value.min || 1)
const targetPercent = computed(() =>
  Math.min(100, Math.max(0, ((props.targetHours - axisRange.value.min) / axisSpan.value) * 100)),
)
const targetTopPercent = computed(() => 100 - targetPercent.value)

const STATUS_COLOR = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }

const bars = computed(() =>
  props.series.map((week, i) => {
    const status = weeklyWorkedStatus(week.hours, props.targetHours)
    return {
      ...week,
      index: i,
      heightPercent: Math.min(100, Math.max(0, ((week.hours - axisRange.value.min) / axisSpan.value) * 100)),
      status,
      accentColor: STATUS_COLOR[status],
    }
  }),
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
    return show ? week.monday.toLocaleString('en-GB', { month: 'short' }).toUpperCase() : ''
  })
})

const { active: hovered, style: tooltipStyle, show: showTooltip, hide: hideTooltip } = useChartTooltip()

const tooltipRows = computed(() => {
  if (!hovered.value) return []
  return [
    { label: 'Range', value: formatWeekRange(hovered.value.monday) },
    { label: 'Worked', value: formatHours(hovered.value.hours) },
  ]
})
</script>

<template>
  <div class="chart">
    <div class="plot-row">
      <div class="y-axis">
        <span class="y-label max">{{ formatHours(axisRange.max) }}</span>
        <span class="y-label target" :style="{ top: targetTopPercent + '%' }">{{ formatHours(targetHours) }}</span>
        <span class="y-label min">{{ formatHours(axisRange.min) }}</span>
      </div>
      <div class="plot">
        <div class="target-line" :style="{ bottom: targetPercent + '%' }"></div>
        <div
          v-for="bar in bars"
          :key="bar.monday.getTime()"
          class="bar"
          :class="'status-' + bar.status"
          :style="{ height: bar.heightPercent + '%', animationDelay: bar.index * 18 + 'ms' }"
          @mouseenter="showTooltip($event, bar)"
          @mouseleave="hideTooltip"
        ></div>
      </div>
    </div>
    <div class="axis-row">
      <span class="axis-spacer"></span>
      <div class="axis-labels">
        <span v-for="(label, i) in axisLabels" :key="i" class="axis-label">{{ label }}</span>
      </div>
    </div>

    <ChartTooltip
      v-if="hovered"
      :title="`Week ${getISOWeekNumber(hovered.monday)}`"
      :rows="tooltipRows"
      :pos-style="tooltipStyle"
      :accent-color="hovered.accentColor"
    />
  </div>
</template>

<style scoped>
.chart {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.plot-row {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.y-axis {
  position: relative;
  width: 34px;
  flex-shrink: 0;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
}

.y-label {
  position: absolute;
  right: 0;
  white-space: nowrap;
}

.y-label.max {
  top: 0;
}

.y-label.min {
  bottom: 0;
}

.y-label.target {
  transform: translateY(-50%);
  background: var(--surface);
}

.plot {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 150px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}

.target-line {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  border-top: 1px dashed var(--line-2);
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
  gap: 8px;
  margin-top: 7px;
}

.axis-spacer {
  width: 34px;
  flex-shrink: 0;
}

.axis-labels {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  flex: 1;
  min-width: 0;
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
