<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'

const props = defineProps({
  hoursByWeekday: { type: Array, required: true }, // [Mon..Fri] average hours
  dailyTargetHours: { type: Number, required: true },
})

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

// Same headroom idea as the weekly chart's SCALE_RATIO, applied to a single
// day instead of a week.
const SCALE_RATIO = 1.1
const scaleMaxHours = computed(() => props.dailyTargetHours * SCALE_RATIO)

const rows = computed(() =>
  DAY_LABELS.map((label, i) => {
    const hours = props.hoursByWeekday[i] || 0
    return {
      label,
      hours,
      widthPercent: Math.min(100, (hours / scaleMaxHours.value) * 100),
      status: hours >= props.dailyTargetHours ? 'ok' : 'warn',
    }
  }),
)
</script>

<template>
  <div class="weekday-averages">
    <div v-for="(row, i) in rows" :key="row.label" class="row">
      <span class="day-label">{{ row.label }}</span>
      <div class="track">
        <div
          class="fill"
          :class="'status-' + row.status"
          :style="{ width: row.widthPercent + '%', animationDelay: i * 60 + 100 + 'ms' }"
        ></div>
      </div>
      <span class="value">{{ formatHours(row.hours) }}</span>
    </div>
  </div>
</template>

<style scoped>
.weekday-averages {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.row {
  display: grid;
  grid-template-columns: 34px 1fr 58px;
  align-items: center;
  gap: 10px;
}

.day-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--dim);
  letter-spacing: 0.08em;
}

.track {
  position: relative;
  height: 7px;
  background: var(--surface2);
  border-radius: var(--r);
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--r);
  transform-origin: left;
  animation: growX 0.55s var(--ease) both;
}

.fill.status-ok {
  background: var(--ok);
}

.fill.status-warn {
  background: var(--warn);
}

.value {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--dim);
  text-align: right;
}
</style>
