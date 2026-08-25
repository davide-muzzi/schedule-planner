<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { ChevronLeft, ChevronRight, CalendarDays } from '@lucide/vue'
import { formatWeekRange, formatHours, getMonday, toISODate, getISOWeekNumber } from '@/utils/date'
import {
  OVERALL_BALANCE_GREEN_MAX_OVER_HOURS,
  OVERALL_BALANCE_RED_THRESHOLD_HOURS,
  WEEKLY_WORKED_GREEN_MAX_OVER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS,
  UPCOMING_APPOINTMENTS_YELLOW_MAX_GAP_HOURS,
  BUSINESS_DAYS_PER_WEEK,
} from '@/utils/constants'
import WeeklyProgressBar from './WeeklyProgressBar.vue'
import MiniCalendar from './MiniCalendar.vue'

const props = defineProps({
  monday: { type: Date, required: true },
  weeklyTotalHours: { type: Number, required: true },
  weeklyTargetHours: { type: Number, required: true },
  overallBalance: { type: Object, required: true }, // { actualHours, expectedHours, manualAdjustmentHours, diffHours }
  futureAppointmentHours: { type: Number, required: true },
  holidaysRemaining: { type: Number, required: true },
  holidayAdjustmentDays: { type: Number, required: true },
})

const emit = defineEmits([
  'prev',
  'next',
  'today',
  'select-date',
  'apply-adjustment',
  'apply-holiday-adjustment',
])

const isCurrentWeek = computed(() => toISODate(props.monday) === toISODate(getMonday(new Date())))
const weekKicker = computed(() => `Calendar week ${getISOWeekNumber(props.monday)}`)

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

// How far the overall balance falls short of covering the upcoming
// appointments - <= 0 means the balance already covers them.
const appointmentsGap = computed(() => props.futureAppointmentHours - diff.value)

const appointmentsStatus = computed(() => {
  if (appointmentsGap.value <= 0) return 'green' // balance already covers the upcoming appointments
  if (appointmentsGap.value <= UPCOMING_APPOINTMENTS_YELLOW_MAX_GAP_HOURS) return 'yellow'
  return 'red'
})

const weeklyDiff = computed(() => props.weeklyTotalHours - props.weeklyTargetHours)

const weeklyStatus = computed(() => {
  if (weeklyDiff.value < -WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS) return 'red' // over 2h too little
  if (weeklyDiff.value < 0) return 'yellow' // up to 2h too little
  if (weeklyDiff.value <= WEEKLY_WORKED_GREEN_MAX_OVER_HOURS) return 'green' // target to +2h over
  if (weeklyDiff.value <= WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS) return 'yellow' // +2h to +5h over
  return 'red' // over 5h too much
})

// Same "+36m" / "on target" convention as DayTable's per-day goal-diff.
function formatDiff(hours) {
  if (Math.abs(hours) < 0.01) return 'on target'
  const sign = hours > 0 ? '+' : '-'
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${sign}${m}m`
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}

const weeklyDiffLabel = computed(() => formatDiff(weeklyDiff.value))

const currentAdjustmentLabel = computed(() => {
  const h = props.overallBalance.manualAdjustmentHours
  if (Math.abs(h) < 0.01) return 'No correction applied'
  return `Current correction: ${h > 0 ? '+' : ''}${formatHours(h)}`
})

const showAdjustPopup = ref(false)
const adjustHours = ref(0)
const adjustMinutes = ref(0)
const showCalendar = ref(false)
const pickWeekBtnRef = ref(null)
const showHolidayPopup = ref(false)
const holidayAdjustDays = ref(0)
const holidayAdjustHours = ref(0)
const holidayAdjustMinutes = ref(0)

// Both adjust popups are teleported to <body> (see template) for the same
// reason MiniCalendar's popup is: left as regular absolutely-positioned
// descendants, they end up trapped behind day-row entry blocks once those
// settle into a resting `transform: scaleX(1)` and pick up their own
// stacking context, painting over a same-page popover despite its z-index.
// Teleporting means position has to be computed from the trigger button's
// own rect instead of relying on CSS being relative to a parent.
const adjustBtnRef = ref(null)
const holidayBtnRef = ref(null)
const adjustPopupStyle = ref({})
const holidayPopupStyle = ref({})

function anchoredStyle(anchorEl) {
  const rect = anchorEl?.getBoundingClientRect?.()
  if (!rect) return {}
  return {
    position: 'fixed',
    top: `${rect.bottom + 8}px`,
    left: `${rect.left}px`,
  }
}

function repositionOpenPopups() {
  if (showAdjustPopup.value) adjustPopupStyle.value = anchoredStyle(adjustBtnRef.value)
  if (showHolidayPopup.value) holidayPopupStyle.value = anchoredStyle(holidayBtnRef.value)
}

// A day of holiday isn't a fixed 24h/8h block, it's whatever the current
// daily worktime goal says a day is worth - same conversion the rest of the
// app already uses for a Vacation day's credit.
const dailyTargetHours = computed(() => props.weeklyTargetHours / BUSINESS_DAYS_PER_WEEK)

function toggleAdjustPopup() {
  showCalendar.value = false
  showHolidayPopup.value = false
  showAdjustPopup.value = !showAdjustPopup.value
  adjustHours.value = 0
  adjustMinutes.value = 0
  if (showAdjustPopup.value) adjustPopupStyle.value = anchoredStyle(adjustBtnRef.value)
}

function toggleCalendar() {
  showAdjustPopup.value = false
  showHolidayPopup.value = false
  showCalendar.value = !showCalendar.value
}

function toggleHolidayPopup() {
  showAdjustPopup.value = false
  showCalendar.value = false
  showHolidayPopup.value = !showHolidayPopup.value
  holidayAdjustDays.value = 0
  holidayAdjustHours.value = 0
  holidayAdjustMinutes.value = 0
  if (showHolidayPopup.value) holidayPopupStyle.value = anchoredStyle(holidayBtnRef.value)
}

function closePopups() {
  showAdjustPopup.value = false
  showCalendar.value = false
  showHolidayPopup.value = false
}

function applyAdjustment(sign) {
  const deltaMinutes = sign * (Math.max(0, adjustHours.value || 0) * 60 + Math.max(0, adjustMinutes.value || 0))
  if (deltaMinutes === 0) return
  emit('apply-adjustment', deltaMinutes)
  showAdjustPopup.value = false
}

const currentHolidayAdjustmentLabel = computed(() => {
  const d = props.holidayAdjustmentDays
  if (Math.abs(d) < 0.001) return 'No correction applied'
  return `Current correction: ${d > 0 ? '+' : ''}${d} day${Math.abs(d) === 1 ? '' : 's'}`
})

function formatDays(n) {
  const rounded = Math.round(n * 10) / 10 // allow half-days, avoid floating point noise
  return `${rounded} day${Math.abs(rounded) === 1 ? '' : 's'}`
}

function applyHolidayAdjustment(sign) {
  const wholeDays = Math.max(0, holidayAdjustDays.value || 0)
  const hoursPart = Math.max(0, holidayAdjustHours.value || 0)
  const minutesPart = Math.max(0, holidayAdjustMinutes.value || 0)
  const fractionalDays = (hoursPart + minutesPart / 60) / dailyTargetHours.value
  const totalDays = wholeDays + fractionalDays
  if (totalDays === 0) return
  emit('apply-holiday-adjustment', sign * totalDays)
  showHolidayPopup.value = false
}

function selectDate(date) {
  showCalendar.value = false
  emit('select-date', date)
}

onMounted(() => {
  document.addEventListener('click', closePopups)
  window.addEventListener('resize', repositionOpenPopups)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closePopups)
  window.removeEventListener('resize', repositionOpenPopups)
})
</script>

<template>
  <div class="planner-header">
    <div class="header-top">
      <div class="header-title">
        <p class="kicker">{{ weekKicker }}</p>
        <h1 class="date-range">{{ formatWeekRange(monday) }}</h1>
      </div>

      <div class="header-nav">
        <button type="button" class="icon-btn" @click="emit('prev')" aria-label="Previous week"><ChevronLeft :size="16" /></button>
        <button type="button" class="icon-btn" @click="emit('next')" aria-label="Next week"><ChevronRight :size="16" /></button>
        <button type="button" class="today-btn" :class="{ 'is-current': isCurrentWeek }" @click="emit('today')">Today</button>
        <div class="pick-week">
          <button ref="pickWeekBtnRef" type="button" class="pick-week-btn" @click.stop="toggleCalendar">
            <CalendarDays :size="14" /> Pick week
          </button>
          <MiniCalendar v-if="showCalendar" :monday="monday" :anchor="pickWeekBtnRef" @select="selectDate" />
        </div>
      </div>
    </div>

    <div class="status-strip">
      <div class="strip-cell adjustable">
        <button ref="holidayBtnRef" type="button" class="cell-trigger" @click.stop="toggleHolidayPopup">
          <span class="cell-label">Vacation remaining</span>
          <span class="cell-value">{{ formatDays(holidaysRemaining) }}</span>
          <span class="cell-hint">Click to adjust</span>
        </button>

        <Teleport to="body">
          <div v-if="showHolidayPopup" class="adjust-popup holiday-popup" :style="holidayPopupStyle" @click.stop>
            <p class="adjust-current">{{ currentHolidayAdjustmentLabel }}</p>
            <div class="adjust-inputs">
              <label>
                days
                <input v-model.number="holidayAdjustDays" type="number" min="0" />
              </label>
              <label>
                h
                <input v-model.number="holidayAdjustHours" type="number" min="0" />
              </label>
              <label>
                min
                <input v-model.number="holidayAdjustMinutes" type="number" min="0" max="59" />
              </label>
            </div>
            <div class="adjust-actions">
              <button type="button" class="adjust-btn subtract" @click="applyHolidayAdjustment(-1)">− Subtract</button>
              <button type="button" class="adjust-btn add" @click="applyHolidayAdjustment(1)">+ Add</button>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="strip-cell">
        <span class="cell-label">Upcoming appointments</span>
        <span class="cell-value" :class="'status-' + appointmentsStatus">{{ formatHours(futureAppointmentHours) }}</span>
      </div>

      <div class="strip-cell adjustable">
        <button ref="adjustBtnRef" type="button" class="cell-trigger" @click.stop="toggleAdjustPopup">
          <span class="cell-label">Overall balance</span>
          <span class="cell-value" :class="'status-' + status">{{ diffLabel }}</span>
          <span class="cell-hint">Click to adjust</span>
        </button>

        <Teleport to="body">
          <div v-if="showAdjustPopup" class="adjust-popup" :style="adjustPopupStyle" @click.stop>
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
        </Teleport>
      </div>

      <div class="strip-cell worked-cell">
        <span class="cell-label">Worked this week</span>
        <span class="cell-value-row">
          <span class="cell-value" :class="'status-' + weeklyStatus">{{ formatHours(weeklyTotalHours) }}</span>
          <span class="cell-value-target">/ {{ formatHours(weeklyTargetHours) }}</span>
          <span class="cell-value-diff" :class="'status-' + weeklyStatus">{{ weeklyDiffLabel }}</span>
        </span>
        <WeeklyProgressBar :weekly-total-hours="weeklyTotalHours" :weekly-target-hours="weeklyTargetHours" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.planner-header {
  margin-bottom: 2rem;
  animation: fadeUp 0.3s var(--ease) both;
}

.header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2rem;
  padding-bottom: 1.4rem;
}

.kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.date-range {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--fg);
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.icon-btn:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.today-btn {
  padding: 7px 13px;
  border-radius: var(--r);
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s;
}

.today-btn:hover {
  background: var(--accent-tint);
}

.today-btn.is-current {
  background: var(--accent);
  color: var(--bg);
}

.pick-week {
  position: relative;
}

.pick-week-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.pick-week-btn:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.status-strip {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  border-top: 1px solid var(--line-2);
  border-bottom: 1px solid var(--line-2);
}

.strip-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 16px 24px;
  border-right: 1px solid var(--line);
  min-width: 9rem;
}

.strip-cell:last-child {
  border-right: none;
}

.worked-cell {
  flex: 1.7;
  gap: 8px;
  min-width: 16rem;
}

.cell-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

.cell-value {
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 500;
  color: var(--fg);
  white-space: nowrap;
}

.cell-hint {
  font-size: 10px;
  color: var(--mute);
}

.cell-value-row {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
}

.cell-value-target {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--mute);
}

.cell-value-diff {
  font-family: var(--font-mono);
  font-size: 10.5px;
  margin-left: auto;
}

.cell-value-diff.status-green {
  color: var(--ok);
}

.cell-value-diff.status-yellow {
  color: var(--warn);
}

.cell-value-diff.status-red {
  color: var(--bad);
}

.cell-value.status-green {
  color: var(--ok);
}

.cell-value.status-yellow {
  color: var(--warn);
}

.cell-value.status-red {
  color: var(--bad);
}

.adjustable {
  position: relative;
}

.cell-trigger {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
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
  z-index: 300;
  width: 13rem;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r2);
  padding: 0.75rem;
  text-align: left;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.holiday-popup {
  width: 16rem;
}

.adjust-current {
  font-size: 0.75rem;
  color: var(--dim);
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
  color: var(--fg);
  flex: 1;
}

.adjust-inputs input {
  padding: 0.3rem 0.4rem;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--surface2);
  color: var(--fg);
  font-size: 0.85rem;
  font-family: var(--font-mono);
  width: 100%;
}

.adjust-actions {
  display: flex;
  gap: 0.5rem;
}

.adjust-btn {
  flex: 1;
  padding: 0.35rem 0;
  border-radius: var(--r2);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.adjust-btn.add {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--bg);
}

.adjust-btn.subtract {
  background: var(--bad);
  border: 1px solid var(--bad);
  color: var(--bg);
}
</style>
