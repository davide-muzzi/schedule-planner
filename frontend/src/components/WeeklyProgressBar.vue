<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'
import { RED_THRESHOLD_HOURS, YELLOW_THRESHOLD_HOURS } from '@/utils/constants'

const props = defineProps({
  weeklyTotalHours: { type: Number, required: true },
  weeklyTargetHours: { type: Number, required: true },
})

// The bar's scale runs from 0 to target*BUFFER_RATIO, not just 0 to target -
// otherwise hitting the goal would fill the bar completely, leaving no room
// to show overtime. This keeps the goal tick at a fixed ~83% position
// (1 / BUFFER_RATIO) regardless of the actual numbers. Hours beyond the
// buffer just clamp the fill at 100% rather than growing the scale further.
const BUFFER_RATIO = 1.2

const barMaxHours = computed(() => props.weeklyTargetHours * BUFFER_RATIO)
const fillPercent = computed(() => Math.min(100, (props.weeklyTotalHours / barMaxHours.value) * 100))
const goalPercent = computed(() => Math.min(100, (props.weeklyTargetHours / barMaxHours.value) * 100))

const diff = computed(() => props.weeklyTotalHours - props.weeklyTargetHours)

// Same shape/thresholds as the Weekly Balance modal's per-row coloring:
// any overage is green, shortfall severity determines yellow vs red.
const status = computed(() => {
  if (diff.value >= 0) return 'green'
  const shortfall = Math.abs(diff.value)
  if (shortfall > RED_THRESHOLD_HOURS) return 'red'
  if (shortfall > YELLOW_THRESHOLD_HOURS) return 'yellow'
  return 'green'
})

const tooltip = computed(
  () => `${formatHours(props.weeklyTotalHours)} worked of ${formatHours(props.weeklyTargetHours)} target this week`,
)

// A subtle scale reference every 5h, stopping short of the bar's own edge.
const hourMarks = computed(() => {
  const marks = []
  for (let h = 5; h < barMaxHours.value; h += 5) {
    marks.push((h / barMaxHours.value) * 100)
  }
  return marks
})
</script>

<template>
  <div class="progress-bar" :title="tooltip">
    <div class="progress-track">
      <div class="progress-fill" :class="'status-' + status" :style="{ width: fillPercent + '%' }"></div>
      <span v-for="mark in hourMarks" :key="mark" class="hour-mark" :style="{ left: mark + '%' }"></span>
      <div class="goal-tick" :style="{ left: goalPercent + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.progress-bar {
  flex: 1;
  min-width: 10rem;
  max-width: 30rem;
}

.progress-track {
  position: relative;
  height: 1.1rem;
  border-radius: 3px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  overflow: visible;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s ease;
}

.hour-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.35);
  transform: translateX(-0.5px);
}

.progress-fill.status-green {
  background: #16a34a;
}

.progress-fill.status-yellow {
  background: #ca8a04;
}

.progress-fill.status-red {
  background: #dc2626;
}

.goal-tick {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 2px;
  background: var(--color-heading);
  transform: translateX(-1px);
}
</style>
