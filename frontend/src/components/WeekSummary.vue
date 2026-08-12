<script setup>
import { computed } from 'vue'
import { formatWeekRange, formatHours } from '@/utils/date'
import { RED_THRESHOLD_HOURS, YELLOW_THRESHOLD_HOURS } from '@/utils/constants'

const props = defineProps({
  monday: { type: Date, required: true },
  weeklyTotalHours: { type: Number, required: true },
  overallBalance: { type: Object, required: true }, // { actualHours, expectedHours, diffHours }
})

const emit = defineEmits(['prev', 'next', 'today'])

const diff = computed(() => props.overallBalance.diffHours)

const status = computed(() => {
  const abs = Math.abs(diff.value)
  if (abs > RED_THRESHOLD_HOURS) return 'red'
  if (abs > YELLOW_THRESHOLD_HOURS) return 'yellow'
  return 'green'
})

const diffLabel = computed(() => {
  if (Math.abs(diff.value) < 0.01) return 'right on target'
  const label = formatHours(Math.abs(diff.value))
  return diff.value > 0 ? `${label} over` : `${label} under`
})
</script>

<template>
  <div class="week-summary">
    <div class="nav">
      <button type="button" class="nav-btn" @click="emit('prev')" aria-label="Previous week">&larr;</button>
      <div class="range">
        <span class="range-label">{{ formatWeekRange(monday) }}</span>
        <button type="button" class="today-btn" @click="emit('today')">Today</button>
      </div>
      <button type="button" class="nav-btn" @click="emit('next')" aria-label="Next week">&rarr;</button>
    </div>

    <div class="totals">
      <div class="total-block">
        <span class="total-label">Worked this week</span>
        <span class="total-value">{{ formatHours(weeklyTotalHours) }}</span>
      </div>
      <div class="total-block">
        <span class="total-label">Expected (all-time)</span>
        <span class="total-value">{{ formatHours(overallBalance.expectedHours) }}</span>
      </div>
      <div class="total-block" :class="'status-' + status">
        <span class="total-label">Overall balance</span>
        <span class="total-value">{{ diffLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  margin-bottom: 1.25rem;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-btn {
  font-size: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.nav-btn:hover {
  border-color: var(--color-border-hover);
}

.range {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.range-label {
  font-weight: 600;
  color: var(--color-heading);
}

.today-btn {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  opacity: 0.75;
  cursor: pointer;
}

.totals {
  display: flex;
  gap: 1.5rem;
}

.total-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 6.5rem;
}

.total-label {
  font-size: 0.7rem;
  opacity: 0.65;
}

.total-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.status-green .total-value {
  color: #16a34a;
}

.status-yellow .total-value {
  color: #ca8a04;
}

.status-red .total-value {
  color: #dc2626;
}
</style>
