<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatWeekRange, formatHours, getMonday, toISODate } from '@/utils/date'
import {
  OVERALL_BALANCE_GREEN_MAX_OVER_HOURS,
  OVERALL_BALANCE_RED_THRESHOLD_HOURS,
  WEEKLY_WORKED_GREEN_MAX_OVER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS,
} from '@/utils/constants'
import WeeklyProgressBar from './WeeklyProgressBar.vue'

const props = defineProps({
  monday: { type: Date, required: true },
  weeklyTotalHours: { type: Number, required: true },
  weeklyTargetHours: { type: Number, required: true },
  overallBalance: { type: Object, required: true }, // { actualHours, expectedHours, manualAdjustmentHours, diffHours }
  futureAppointmentHours: { type: Number, required: true },
})

const emit = defineEmits(['prev', 'next', 'today', 'apply-adjustment', 'add-entry', 'open-weekly-balance'])

const isCurrentWeek = computed(() => toISODate(props.monday) === toISODate(getMonday(new Date())))

const diff = computed(() => props.overallBalance.diffHours)

const status = computed(() => {
  if (diff.value <= -OVERALL_BALANCE_RED_THRESHOLD_HOURS) return 'red' // 10h or more under
  if (diff.value < 0) return 'yellow' // shortfall under 10h
  if (diff.value <= OVERALL_BALANCE_GREEN_MAX_OVER_HOURS) return 'green' // target up to +5h over
  if (diff.value < OVERALL_BALANCE_RED_THRESHOLD_HOURS) return 'yellow' // +5h to +10h over
  return 'red' // +10h or more over
})

const diffLabel = computed(() => {
  if (Math.abs(diff.value) < 0.01) return 'right on target'
  const label = formatHours(Math.abs(diff.value))
  return diff.value > 0 ? `${label} over` : `${label} under`
})

const weeklyDiff = computed(() => props.weeklyTotalHours - props.weeklyTargetHours)

const weeklyStatus = computed(() => {
  if (weeklyDiff.value < -WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS) return 'red' // over 2h too little
  if (weeklyDiff.value < 0) return 'yellow' // up to 2h too little
  if (weeklyDiff.value <= WEEKLY_WORKED_GREEN_MAX_OVER_HOURS) return 'green' // target to +2h over
  if (weeklyDiff.value <= WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS) return 'yellow' // +2h to +5h over
  return 'red' // over 5h too much
})

const currentAdjustmentLabel = computed(() => {
  const h = props.overallBalance.manualAdjustmentHours
  if (Math.abs(h) < 0.01) return 'No correction applied'
  return `Current correction: ${h > 0 ? '+' : ''}${formatHours(h)}`
})

const showAdjustPopup = ref(false)
const adjustHours = ref(0)
const adjustMinutes = ref(0)

function toggleAdjustPopup() {
  showAdjustPopup.value = !showAdjustPopup.value
  adjustHours.value = 0
  adjustMinutes.value = 0
}

function closeAdjustPopup() {
  showAdjustPopup.value = false
}

function applyAdjustment(sign) {
  const deltaMinutes = sign * (Math.max(0, adjustHours.value || 0) * 60 + Math.max(0, adjustMinutes.value || 0))
  if (deltaMinutes === 0) return
  emit('apply-adjustment', deltaMinutes)
  showAdjustPopup.value = false
}

onMounted(() => document.addEventListener('click', closeAdjustPopup))
onBeforeUnmount(() => document.removeEventListener('click', closeAdjustPopup))
</script>

<template>
  <div class="week-summary-row">
    <div class="summary-card nav-card">
      <button type="button" class="nav-btn" @click="emit('prev')" aria-label="Previous week">&larr;</button>
      <span class="range-label">{{ formatWeekRange(monday) }}</span>
      <button type="button" class="nav-btn" @click="emit('next')" aria-label="Next week">&rarr;</button>
      <button type="button" class="today-btn" :class="{ 'is-today': isCurrentWeek }" @click="emit('today')">
        <span :class="{ 'today-btn-text': isCurrentWeek }">Today</span>
      </button>
    </div>

    <div class="summary-card stat-card">
      <span class="total-label">Upcoming appointments</span>
      <span class="total-value">{{ formatHours(futureAppointmentHours) }}</span>
    </div>

    <div class="summary-card stat-card adjustable">
      <button type="button" class="adjust-trigger" @click.stop="toggleAdjustPopup">
        <span class="total-label">Overall balance</span>
        <span class="total-value" :class="'status-' + status">{{ diffLabel }}</span>
      </button>

      <div v-if="showAdjustPopup" class="adjust-popup" @click.stop>
        <p class="adjust-current">{{ currentAdjustmentLabel }}</p>
        <div class="adjust-inputs">
          <label>
            h
            <input v-model.number="adjustHours" type="number" min="0" />
          </label>
          <label>
            min
            <input v-model.number="adjustMinutes" type="number" min="0" max="59" />
          </label>
        </div>
        <div class="adjust-actions">
          <button type="button" class="adjust-btn subtract" @click="applyAdjustment(-1)">− Subtract</button>
          <button type="button" class="adjust-btn add" @click="applyAdjustment(1)">+ Add</button>
        </div>
      </div>
    </div>

    <div class="summary-card worked-card">
      <div class="total-block">
        <span class="total-label">Worked this week</span>
        <span class="total-value-row">
          <span class="total-value" :class="'status-' + weeklyStatus">{{ formatHours(weeklyTotalHours) }}</span>
          <span class="total-value-target">/ {{ formatHours(weeklyTargetHours) }}</span>
        </span>
      </div>

      <WeeklyProgressBar :weekly-total-hours="weeklyTotalHours" :weekly-target-hours="weeklyTargetHours" />
    </div>

    <div class="summary-card weekly-balance-card">
      <button type="button" class="weekly-balance-btn" @click="emit('open-weekly-balance')">📊 Weekly Balance</button>
    </div>

    <div class="summary-card add-entry-card">
      <button type="button" class="add-entry-btn" @click="emit('add-entry')">+ Add Entry</button>
    </div>
  </div>
</template>

<style scoped>
.week-summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.summary-card {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
}

.nav-card {
  flex: 1;
  justify-content: space-between;
}

.stat-card {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-width: 8rem;
}

.worked-card {
  gap: 1rem;
  min-width: 26rem;
}

.weekly-balance-card,
.add-entry-card {
  padding: 0;
  width: 6rem;
  height: 6rem;
  overflow: hidden;
}

.weekly-balance-btn {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.4rem;
}

.weekly-balance-btn:hover {
  background: var(--color-background);
}

.add-entry-btn {
  width: 100%;
  height: 100%;
  background: #3b82f6;
  border: none;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.add-entry-btn:hover {
  background: #2563eb;
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

.range-label {
  font-weight: 600;
  color: var(--color-heading);
  /* Fixed width so cross-month ranges ("Aug 31 – Sep 4, 2026") don't push
     everything after this label around compared to same-month ones
     ("Aug 10 – 14, 2026") - the box stays constant, only the text inside it
     changes. */
  min-width: 11rem;
  text-align: center;
}

.today-btn {
  display: flex;
  align-items: center;
  height: 1.6rem;
  padding: 0 0.75rem;
  font-size: 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  opacity: 0.75;
  cursor: pointer;
}

.today-btn-text {
  background: linear-gradient(
    45deg,
    #00c3ff,
    #ffff1c,
    #00c3ff,
    #ffff1c,
    #00c3ff,
    #ffff1c,
    #00c3ff,
    #ffff1c,
    #00c3ff,
    #ffff1c
  );
  background-size: 400% 400%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: today-btn-gradient 24s linear infinite;
}

@keyframes today-btn-gradient {
  0% {
    background-position: 0 0;
  }
  50% {
    background-position: 400% 0;
  }
  100% {
    background-position: 0 0;
  }
}

.today-btn:hover {
  border-color: #1d4ed8;
  background: #3b82f6;
  color: #fff;
  opacity: 1;
}

.today-btn:hover .today-btn-text {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: #fff;
  animation: none;
}

.total-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.total-label {
  font-size: 0.7rem;
  opacity: 0.65;
}

.total-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.total-value-row {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
}

.total-value-target {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.55;
}

.total-value.status-green {
  color: #16a34a;
}

.total-value.status-yellow {
  color: #ca8a04;
}

.total-value.status-red {
  color: #dc2626;
}

.adjustable {
  position: relative;
}

.adjust-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: none;
  border: none;
  margin: 0;
  padding: 0;
  appearance: none;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  cursor: pointer;
}

.adjust-popup {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  z-index: 10;
  width: 13rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: left;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.adjust-current {
  font-size: 0.75rem;
  opacity: 0.75;
  margin-bottom: 0.5rem;
}

.adjust-inputs {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.adjust-inputs label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  flex: 1;
}

.adjust-inputs input {
  padding: 0.3rem 0.4rem;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
  width: 100%;
}

.adjust-actions {
  display: flex;
  gap: 0.5rem;
}

.adjust-btn {
  flex: 1;
  padding: 0.35rem 0;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.adjust-btn.add {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.adjust-btn.subtract {
  background: #dc2626;
  border: 1px solid #b91c1c;
  color: #fff;
}
</style>
