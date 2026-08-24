<script setup>
import { computed } from 'vue'
import { formatHours, formatWeekRange, getISOWeekNumber } from '@/utils/date'
import { useChartTooltip } from '@/composables/useChartTooltip'
import ChartTooltip from './ChartTooltip.vue'

const props = defineProps({
  series: { type: Array, required: true }, // [{ monday, diffHours }], oldest first
})

// How far off target the chart needs to reach, rounded up to a "nice" step
// rather than the raw max - keeps the axis labels readable (1h, 2h, 5h...)
// instead of something like "3.42h". A tiny run of near-zero weeks still
// gets a sensible minimum range instead of a chart with no visible range.
const NICE_STEPS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50]

const maxAbsDiff = computed(() => props.series.reduce((max, w) => Math.max(max, Math.abs(w.diffHours)), 0))

const scaleMaxHours = computed(() => {
  if (maxAbsDiff.value <= 0) return 1
  const withHeadroom = maxAbsDiff.value * 1.15
  return NICE_STEPS.find((s) => s >= withHeadroom) ?? Math.ceil(withHeadroom / 10) * 10
})

// viewBox is 240x84 with the zero baseline at y=42. AMPLITUDE is how many px
// of vertical travel the scale's edge (±scaleMaxHours) gets, leaving a small
// margin top/bottom in the box instead of touching its edges exactly.
const AMPLITUDE = 36

// x/y kept in viewBox units (for the SVG line) and as 0-100% (for the HTML
// dots/labels overlaid on top) - the dots are plain HTML rather than SVG
// <circle> because the SVG is stretched non-uniformly (preserveAspectRatio
// "none", width flexes with the card but height is fixed), which would
// otherwise squash circles into ovals. A straight polyline survives that
// stretch fine with vector-effect="non-scaling-stroke" to keep its line
// width constant.
const points = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  return props.series.map((week, i) => {
    const xPercent = n === 1 ? 50 : (i / (n - 1)) * 100
    const clamped = Math.max(-scaleMaxHours.value, Math.min(scaleMaxHours.value, week.diffHours))
    const y = 42 - (clamped / scaleMaxHours.value) * AMPLITUDE
    return { x: (xPercent / 100) * 240, xPercent, y, yPercent: (y / 84) * 100, monday: week.monday, diffHours: week.diffHours }
  })
})

const pointsAttr = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))

// Every label would crowd a 13-point axis, so beyond 10 points only every
// other one renders - always including the first and last so the range
// itself is never ambiguous. All labels anchor to their point's exact x -
// centered, same as every other label - rather than the first/last being
// pinned to the container edges like a bar chart's axis would be.
const xLabels = computed(() => {
  const n = points.value.length
  const step = n > 10 ? 2 : 1
  return points.value
    .map((p, i) => ({
      key: p.monday.getTime(),
      xPercent: p.xPercent,
      text: i === 0 || i === n - 1 || i % step === 0 ? `W${getISOWeekNumber(p.monday)}` : '',
    }))
    .filter((l) => l.text)
})

const { active: hovered, style: tooltipStyle, show: showTooltip, hide: hideTooltip } = useChartTooltip()

const tooltipRows = computed(() => {
  if (!hovered.value) return []
  const diff = hovered.value.diffHours
  const diffLabel = Math.abs(diff) < 0.01 ? 'On target' : `${formatHours(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'}`
  return [
    { label: 'Range', value: formatWeekRange(hovered.value.monday) },
    { label: 'Diff', value: diffLabel },
  ]
})

const hoveredAccentColor = computed(() => {
  if (!hovered.value) return 'var(--accent)'
  if (Math.abs(hovered.value.diffHours) < 0.01) return 'var(--line-2)'
  return hovered.value.diffHours > 0 ? 'var(--ok)' : 'var(--bad)'
})
</script>

<template>
  <div class="balance-trend">
    <div class="chart-area">
      <div class="y-axis">
        <span class="y-label top">+{{ formatHours(scaleMaxHours) }}</span>
        <span class="y-label zero">0h</span>
        <span class="y-label bottom">−{{ formatHours(scaleMaxHours) }}</span>
      </div>
      <div class="plot">
        <svg viewBox="0 0 240 84" preserveAspectRatio="none" class="chart-svg">
          <line x1="0" y1="42" x2="240" y2="42" class="baseline" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />
          <polyline v-if="points.length > 1" :points="pointsAttr" class="trend-line" fill="none" vector-effect="non-scaling-stroke" />
        </svg>
        <span
          v-for="p in points"
          :key="p.monday.getTime()"
          class="dot"
          :style="{ left: p.xPercent + '%', top: p.yPercent + '%' }"
          @mouseenter="showTooltip($event, p)"
          @mouseleave="hideTooltip"
        ></span>
      </div>
    </div>
    <div class="x-axis-row">
      <div class="x-axis">
        <span v-for="label in xLabels" :key="label.key" class="x-label" :style="{ left: label.xPercent + '%' }">{{
          label.text
        }}</span>
      </div>
    </div>

    <ChartTooltip
      v-if="hovered"
      :title="`Week ${getISOWeekNumber(hovered.monday)}`"
      :rows="tooltipRows"
      :pos-style="tooltipStyle"
      :accent-color="hoveredAccentColor"
    />
  </div>
</template>

<style scoped>
.balance-trend {
  width: 100%;
}

.chart-area {
  display: flex;
  gap: 8px;
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

.y-label.top {
  top: 0;
}

.y-label.zero {
  top: 50%;
  transform: translateY(-50%);
  color: var(--line-2);
}

.y-label.bottom {
  bottom: 0;
}

.plot {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 84px;
}

.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.baseline {
  stroke: var(--line-2);
}

.trend-line {
  stroke: var(--accent);
  stroke-width: 1.75;
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-dasharray: 600;
  animation: dash 1.1s var(--ease) both;
}

.dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, -50%);
  cursor: default;
}

.x-axis-row {
  margin-top: 6px;
}

.x-axis {
  position: relative;
  height: 12px;
  margin-left: 42px;
}

.x-label {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  white-space: nowrap;
}
</style>
