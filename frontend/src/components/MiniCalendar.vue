<script setup>
import { ref, computed } from 'vue'
import { getMonday, toISODate, addDays } from '@/utils/date'

const props = defineProps({
  monday: { type: Date, required: true }, // week currently shown - used to seed the month and highlight its days
})

const emit = defineEmits(['select'])

const viewMonth = ref(new Date(props.monday.getFullYear(), props.monday.getMonth(), 1))

const monthLabel = computed(() => viewMonth.value.toLocaleString(undefined, { month: 'long', year: 'numeric' }))

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const gridDays = computed(() => {
  const gridStart = getMonday(viewMonth.value)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
})

const todayIso = toISODate(new Date())
const selectedWeekMondayIso = computed(() => toISODate(props.monday))

function isCurrentMonth(date) {
  return date.getMonth() === viewMonth.value.getMonth()
}

function isToday(date) {
  return toISODate(date) === todayIso
}

function isInSelectedWeek(date) {
  return toISODate(getMonday(date)) === selectedWeekMondayIso.value
}

function prevMonth() {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 1)
}
</script>

<template>
  <div class="mini-calendar" @click.stop>
    <div class="cal-header">
      <button type="button" class="cal-nav" @click="prevMonth" aria-label="Previous month">&larr;</button>
      <span class="cal-month-label">{{ monthLabel }}</span>
      <button type="button" class="cal-nav" @click="nextMonth" aria-label="Next month">&rarr;</button>
    </div>

    <div class="cal-weekdays">
      <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
    </div>

    <div class="cal-grid">
      <button
        v-for="date in gridDays"
        :key="toISODate(date)"
        type="button"
        class="cal-day"
        :class="{
          'is-outside': !isCurrentMonth(date),
          'is-today': isToday(date),
          'is-in-week': isInSelectedWeek(date),
        }"
        @click="emit('select', date)"
      >
        {{ date.getDate() }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mini-calendar {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  width: 16rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.cal-month-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-heading);
}

.cal-nav {
  font-size: 0.85rem;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.cal-nav:hover {
  border-color: var(--color-border-hover);
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 0.2rem;
}

.cal-weekdays span {
  text-align: center;
  font-size: 0.65rem;
  opacity: 0.55;
  font-weight: 600;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.15rem;
}

.cal-day {
  aspect-ratio: 1;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;
}

.cal-day:hover {
  background: var(--color-background-soft);
}

.cal-day.is-outside {
  opacity: 0.35;
}

.cal-day.is-in-week {
  background: rgba(59, 130, 246, 0.35);
  color: #fff;
}

.cal-day.is-today {
  font-weight: 700;
  box-shadow: inset 0 0 0 1px #3b82f6;
}

.cal-day.is-in-week:hover,
.cal-day.is-today:hover {
  background: #3b82f6;
  color: #fff;
}
</style>
