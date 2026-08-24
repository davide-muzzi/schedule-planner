<script setup>
import { computed } from 'vue'

const props = defineProps({
  series: { type: Array, required: true }, // [{ monday, diffHours }], oldest first
})

// viewBox is 240x84 with the zero baseline at y=42 - a diff of ±4h fits the
// box exactly (42 - 4*11 = -2, 42 + 4*11 = 86, close enough to the edges to
// read as "the box is ±4h"). Outliers beyond that clamp rather than
// rescaling, same "fixed scale" rule as the other charts on this page.
const points = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  return props.series.map((week, i) => {
    const x = n === 1 ? 120 : (i / (n - 1)) * 240
    const clamped = Math.max(-4, Math.min(4, week.diffHours))
    const y = 42 - clamped * 11
    return { x, y, monday: week.monday, diffHours: week.diffHours }
  })
})

const pointsAttr = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))
</script>

<template>
  <div class="balance-trend">
    <svg viewBox="0 0 240 84" preserveAspectRatio="none" class="chart-svg">
      <line x1="0" y1="42" x2="240" y2="42" class="baseline" stroke-dasharray="3 4" />
      <polyline v-if="points.length > 1" :points="pointsAttr" class="trend-line" fill="none" />
    </svg>
    <div class="footer-row">
      <span>−4h</span>
      <span>{{ series.length }} WEEKS</span>
      <span>+4h</span>
    </div>
  </div>
</template>

<style scoped>
.balance-trend {
  width: 100%;
}

.chart-svg {
  width: 100%;
  height: 84px;
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

.footer-row {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  margin-top: 4px;
}
</style>
