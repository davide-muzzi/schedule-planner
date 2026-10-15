<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { ChevronLeft, ChevronRight, CalendarDays, TriangleAlert } from '@lucide/vue'
import { formatWeekRange, formatHours, getMonday, toISODate, getISOWeekNumber } from '@/utils/date'
import {
  MAX_WEEKLY_WORK_HOURS,
  UPCOMING_APPOINTMENTS_YELLOW_MAX_GAP_HOURS,
  BUSINESS_DAYS_PER_WEEK,
} from '@/utils/constants'
import { weeklyWorkedStatus, overallBalanceStatus } from '@/utils/status'
import { useAppShell } from '@/composables/useAppShell'
import WeeklyProgressBar from './WeeklyProgressBar.vue'
import MiniCalendar from './MiniCalendar.vue'
import MobileCardCarousel from './MobileCardCarousel.vue'

const props = defineProps({
  monday: { type: Date, required: true },
  weeklyTotalHours: { type: Number, required: true },
  weeklyTargetHours: { type: Number, required: true },
  overallBalance: { type: Object, required: true }, // { actualHours, expectedHours, manualAdjustmentHours, diffHours }
  futureAppointmentHours: { type: Number, required: true },
  nextAppointment: { type: Object, default: null },
  holidaysRemaining: { type: Number, required: true },
  holidayAdjustmentDays: { type: Number, required: true },
  includeFutureWeeks: { type: Boolean, required: true },
  statsCutoffMode: { type: String, required: true }, // 'week' | 'day' - only matters while includeFutureWeeks is off
})

const emit = defineEmits([
  'prev',
  'next',
  'today',
  'select-date',
  'apply-adjustment',
  'apply-holiday-adjustment',
  'view-next-appointment',
  'toggle-include-future-weeks',
])

const futureWeeksTitle = computed(() =>
  props.includeFutureWeeks
    ? 'ON: overall balance and upcoming appointments include future weeks. Click to turn off.'
    : `OFF: overall balance and upcoming appointments only count up to ${props.statsCutoffMode === 'day' ? 'today' : 'the end of the current week'}. Click to turn on.`,
)

const { isNarrowViewport } = useAppShell()

// Lets the header's week-range text be swiped left/right on mobile as a
// shortcut for the prev/next buttons - touch-only (mouse is left alone so
// desktop can still drag-select the date text), and deliberately just fires
// the same prev/next emit a button click would rather than animating
// anything itself.
const SWIPE_COMMIT_PX = 50
let headerSwipeStartX = 0
let headerSwipeActive = false

function handleHeaderPointerDown(event) {
  if (event.pointerType !== 'touch') return
  headerSwipeActive = true
  headerSwipeStartX = event.clientX
}

function handleHeaderPointerUp(event) {
  if (!headerSwipeActive || event.pointerType !== 'touch') return
  headerSwipeActive = false
  const delta = event.clientX - headerSwipeStartX
  if (delta <= -SWIPE_COMMIT_PX) emit('next')
  else if (delta >= SWIPE_COMMIT_PX) emit('prev')
}

function handleHeaderPointerCancel() {
  headerSwipeActive = false
}

const isCurrentWeek = computed(() => toISODate(props.monday) === toISODate(getMonday(new Date())))
const weekKicker = computed(() => `Calendar week ${getISOWeekNumber(props.monday)}`)

const diff = computed(() => props.overallBalance.diffHours)

const status = computed(() => overallBalanceStatus(diff.value))

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

const weeklyStatus = computed(() => weeklyWorkedStatus(props.weeklyTotalHours, props.weeklyTargetHours))
const isOverWeeklyMax = computed(() => props.weeklyTotalHours > MAX_WEEKLY_WORK_HOURS)
const weeklyMaxWarning = `Over the legal maximum of ${MAX_WEEKLY_WORK_HOURS}h per week (Art. 9 ArG) — compensate the overtime with time off.`

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
      <div
        class="header-title"
        @pointerdown="handleHeaderPointerDown"
        @pointerup="handleHeaderPointerUp"
        @pointercancel="handleHeaderPointerCancel"
      >
        <p class="kicker">{{ weekKicker }}</p>
        <h1 class="date-range" :class="{ 'is-current': isCurrentWeek }">{{ formatWeekRange(monday) }}</h1>
      </div>

      <div class="header-nav">
        <button
          type="button"
          class="future-weeks-btn"
          :class="includeFutureWeeks ? 'is-on' : 'is-off'"
          :aria-pressed="includeFutureWeeks"
          :title="futureWeeksTitle"
          @click="emit('toggle-include-future-weeks')"
        >
          <span class="future-weeks-prefix">Include </span>future weeks
        </button>
        <button type="button" class="icon-btn" @click="emit('prev')" aria-label="Previous week"><ChevronLeft :size="16" /></button>
        <button type="button" class="icon-btn" @click="emit('next')" aria-label="Next week"><ChevronRight :size="16" /></button>
        <button type="button" class="today-btn" :class="{ 'is-current': isCurrentWeek }" @click="emit('today')">Today</button>
        <div class="pick-week">
          <button ref="pickWeekBtnRef" type="button" class="pick-week-btn" @click.stop="toggleCalendar">
            <CalendarDays :size="14" /><span class="pick-week-label"> Pick week</span>
          </button>
          <MiniCalendar v-if="showCalendar" :monday="monday" :anchor="pickWeekBtnRef" @select="selectDate" />
        </div>
      </div>
    </div>

    <div v-if="!isNarrowViewport" class="status-strip">
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

      <div class="strip-cell" :class="{ adjustable: nextAppointment }">
        <button
          v-if="nextAppointment"
          type="button"
          class="cell-trigger"
          @click.stop="emit('view-next-appointment', nextAppointment)"
        >
          <span class="cell-label">Upcoming appointments</span>
          <span class="cell-value" :class="'status-' + appointmentsStatus">{{ formatHours(futureAppointmentHours) }}</span>
          <span class="cell-hint">Click to view next appointment</span>
        </button>
        <template v-else>
          <span class="cell-label">Upcoming appointments</span>
          <span class="cell-value" :class="'status-' + appointmentsStatus">{{ formatHours(futureAppointmentHours) }}</span>
        </template>
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
          <span v-if="isOverWeeklyMax" class="weekly-max-warning" :title="weeklyMaxWarning">
            <TriangleAlert :size="12" /> Over {{ MAX_WEEKLY_WORK_HOURS }}h max
          </span>
        </span>
        <WeeklyProgressBar :weekly-total-hours="weeklyTotalHours" :weekly-target-hours="weeklyTargetHours" />
      </div>
    </div>

    <!-- Mobile-only: the same four cards, one at a time in a swipe-through
         carousel instead of wrapped into a multi-row grid. Each branch below
         reuses the exact same markup/refs/handlers as its desktop-strip
         counterpart above - order is reversed from the desktop strip
         (graph/worked first, then balance, appointments, vacation last). -->
    <MobileCardCarousel v-else :count="4" class="status-carousel" @change="closePopups" v-slot="{ index }">
      <div v-if="index === 0" class="strip-cell worked-cell carousel-cell">
        <span class="cell-label">Worked this week</span>
        <span class="cell-value-row">
          <span class="cell-value" :class="'status-' + weeklyStatus">{{ formatHours(weeklyTotalHours) }}</span>
          <span class="cell-value-target">/ {{ formatHours(weeklyTargetHours) }}</span>
          <span class="cell-value-diff" :class="'status-' + weeklyStatus">{{ weeklyDiffLabel }}</span>
          <span v-if="isOverWeeklyMax" class="weekly-max-warning" :title="weeklyMaxWarning">
            <TriangleAlert :size="12" /> Over {{ MAX_WEEKLY_WORK_HOURS }}h max
          </span>
        </span>
        <WeeklyProgressBar :weekly-total-hours="weeklyTotalHours" :weekly-target-hours="weeklyTargetHours" />
      </div>

      <div v-else-if="index === 1" class="strip-cell adjustable carousel-cell">
        <button ref="adjustBtnRef" type="button" class="cell-trigger" @click.stop="toggleAdjustPopup">
          <span class="cell-label">Overall balance</span>
          <span class="cell-value" :class="'status-' + status">{{ diffLabel }}</span>
          <span class="cell-hint">Tap to adjust</span>
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

      <div v-else-if="index === 2" class="strip-cell carousel-cell" :class="{ adjustable: nextAppointment }">
        <button
          v-if="nextAppointment"
          type="button"
          class="cell-trigger"
          @click.stop="emit('view-next-appointment', nextAppointment)"
        >
          <span class="cell-label">Upcoming appointments</span>
          <span class="cell-value" :class="'status-' + appointmentsStatus">{{ formatHours(futureAppointmentHours) }}</span>
          <span class="cell-hint">Tap to view next appointment</span>
        </button>
        <template v-else>
          <span class="cell-label">Upcoming appointments</span>
          <span class="cell-value" :class="'status-' + appointmentsStatus">{{ formatHours(futureAppointmentHours) }}</span>
        </template>
      </div>

      <div v-else class="strip-cell adjustable carousel-cell">
        <button ref="holidayBtnRef" type="button" class="cell-trigger" @click.stop="toggleHolidayPopup">
          <span class="cell-label">Vacation remaining</span>
          <span class="cell-value">{{ formatDays(holidaysRemaining) }}</span>
          <span class="cell-hint">Tap to adjust</span>
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
    </MobileCardCarousel>
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

.header-title {
  /* Let the browser keep handling vertical scroll natively over the swipe
     gesture area - only horizontal drags are read as prev/next. */
  touch-action: pan-y;
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

.date-range.is-current {
  color: var(--ok);
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

/* Not a slider/checkbox - the button's own background is the state:
   green while future weeks are included, red while they're cut off. */
.future-weeks-btn {
  margin-right: 8px;
  padding: 7px 13px;
  border-radius: var(--r);
  border: 1px solid;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  /* Flat at rest; slight 3D (a thin darker ledge it sinks into while
     pressed) on hover - or always, on touch devices without hover. See the
     hover media queries below. --ledge is set per state. */
  box-shadow: 0 0 0 var(--ledge);
  transition:
    background-color 0.16s,
    border-color 0.16s,
    color 0.16s,
    transform 0.08s,
    box-shadow 0.08s;
}

.future-weeks-btn.is-on {
  --ledge: color-mix(in srgb, var(--ok) 45%, black);
  background: color-mix(in srgb, var(--ok) 22%, transparent);
  border-color: var(--ok);
  color: var(--ok);
}

.future-weeks-btn.is-off {
  --ledge: color-mix(in srgb, var(--bad) 45%, black);
  background: color-mix(in srgb, var(--bad) 22%, transparent);
  border-color: var(--bad);
  color: var(--bad);
}

/* Hover lifts the button onto its ledge (bottom edge stays put), a press
   pushes it back down flat. */
@media (hover: hover) {
  .future-weeks-btn:hover {
    filter: brightness(1.15);
    transform: translateY(-2px);
    box-shadow: 0 2px 0 var(--ledge);
  }

  .future-weeks-btn:hover:active {
    transform: translateY(0);
    box-shadow: 0 0 0 var(--ledge);
  }
}

/* No hover on touch - stay 3D, a tap presses it down. */
@media (hover: none) {
  .future-weeks-btn {
    box-shadow: 0 2px 0 var(--ledge);
  }

  .future-weeks-btn:active {
    transform: translateY(2px);
    box-shadow: 0 0 0 var(--ledge);
  }
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

.weekly-max-warning {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--bad);
  white-space: nowrap;
  cursor: help;
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

@media (max-width: 900px) {
  .date-range {
    font-size: 26px;
  }

  .header-top {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    padding-bottom: 1rem;
  }

  .header-nav {
    justify-content: flex-end;
  }

  /* The nav row is right-aligned on mobile, leaving its left side empty -
     the toggle claims that space instead of crowding the arrow buttons,
     with a shorter label and the same 30px height as the icon buttons. */
  .future-weeks-btn {
    margin-right: auto;
    height: 30px;
    padding: 0 11px;
  }

  .future-weeks-prefix {
    display: none;
  }

  .strip-cell {
    padding: 12px 14px;
    min-width: 8rem;
  }

  /* Once the strip wraps, let "Worked this week" (the widest cell, with its
     own progress bar) always claim a full row rather than sharing one
     awkwardly with whatever cell happens to fit next to it. */
  .worked-cell {
    min-width: 100%;
  }

  /* Icon-only, square like the prev/next buttons next to it - the text
     label is redundant once it's sitting right beside a calendar icon in a
     row of otherwise-square controls. */
  .pick-week-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    justify-content: center;
    gap: 0;
  }

  .pick-week-label {
    display: none;
  }

  /* WeeklyProgressBar caps itself at 30rem (480px), which desktop cards
     never get close to but a carousel card comfortably exceeds - without
     this it visibly stops short of the card's right edge instead of
     reaching all the way to where the diff number sits above it. */
  .status-carousel .progress-bar {
    max-width: none;
    width: 100%;
  }

  /* Card-styled slideshow: each cell drops the shared-strip look (divider
     borders, flex sizing) in favor of standing alone as its own card, sized
     up a bit since only one is ever on screen at a time. */
  .status-carousel .carousel-cell {
    border-right: none;
    min-width: 0;
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r2);
    padding: 20px 22px;
  }

  .status-carousel .cell-label {
    font-size: 10px;
  }

  .status-carousel .cell-value {
    font-size: 20px;
  }

  .status-carousel .cell-hint {
    font-size: 11px;
  }

  .status-carousel .worked-cell.carousel-cell {
    min-width: 0;
  }
}
</style>
