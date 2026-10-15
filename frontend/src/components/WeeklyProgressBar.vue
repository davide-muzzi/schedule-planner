<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'
import { MAX_WEEKLY_WORK_HOURS } from '@/utils/constants'
import { weeklyWorkedStatus } from '@/utils/status'

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

// The legal weekly max, marked on the bar - only when it actually falls
// inside the bar's scale (always true for a full-time 42h target).
const maxPercent = computed(() => {
  const p = (MAX_WEEKLY_WORK_HOURS / barMaxHours.value) * 100
  return p < 100 ? p : null
})

// Same coloring as the "Worked this week" value next to it.
const status = computed(() => weeklyWorkedStatus(props.weeklyTotalHours, props.weeklyTargetHours))

const tooltip = computed(
  () =>
    `${formatHours(props.weeklyTotalHours)} worked of ${formatHours(props.weeklyTargetHours)} target this week (legal max ${MAX_WEEKLY_WORK_HOURS}h)`,
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
      <div v-if="maxPercent !== null" class="max-tick" :style="{ left: maxPercent + '%' }"></div>
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
  border-radius: var(--r2);
  background: var(--track);
  border: 1px solid var(--line);
  overflow: visible;
}

.progress-fill {
  height: 100%;
  border-radius: var(--r2);
  transition: width 0.35s var(--ease);
  transform-origin: left;
  animation: growX 0.6s var(--ease) both;
}

.hour-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--fg) 35%, transparent);
  transform: translateX(-0.5px);
}

.progress-fill.status-green {
  background: var(--ok);
}

.progress-fill.status-yellow {
  background: var(--warn);
}

.progress-fill.status-red {
  background: var(--bad);
}

.goal-tick {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 2px;
  background: var(--fg);
  transform: translateX(-1px);
}

.max-tick {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 2px;
  background: var(--bad);
  transform: translateX(-1px);
}
</style>
