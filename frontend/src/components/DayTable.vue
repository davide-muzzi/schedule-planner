<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatDayHeading, durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'
import { DAILY_RED_THRESHOLD_HOURS } from '@/utils/constants'
import { computeBreakWarning } from '@/utils/breakRules'

const props = defineProps({
  date: { type: Date, required: true },
  entries: { type: Array, default: () => [] },
  showGoalDiff: { type: Boolean, default: false },
  dailyTargetHours: { type: Number, required: true },
  viewFromHour: { type: Number, required: true },
  viewTillHour: { type: Number, required: true },
  entryTypeColors: { type: Object, required: true },
})

const emit = defineEmits(['add', 'edit'])

// The timeline zoom is purely visual - visibleHours only drives the header
// labels, grid lines, and block positioning math below. Totals, the daily
// goal diff, and the break-law check all keep operating on the real,
// unfiltered entry data regardless of what's currently zoomed into view.
const visibleHours = computed(() =>
  Array.from({ length: props.viewTillHour - props.viewFromHour }, (_, i) => props.viewFromHour + i),
)
const rangeSpan = computed(() => props.viewTillHour - props.viewFromHour)

const allDayEntries = computed(() => props.entries.filter((e) => e.allDay))
const timedEntries = computed(() => props.entries.filter((e) => !e.allDay))

function entryRange(entry) {
  const start = timeToDecimalHours(entry.startTime) ?? 0
  const rawEnd = timeToDecimalHours(entry.endTime) ?? start
  return { start, end: Math.max(rawEnd, start + 0.25) } // same visual minimum-width floor as before
}

function overlapsView(entry) {
  const { start, end } = entryRange(entry)
  return end > props.viewFromHour && start < props.viewTillHour
}

const visibleTimedEntries = computed(() => timedEntries.value.filter(overlapsView))
const hiddenTimedEntries = computed(() => timedEntries.value.filter((e) => !overlapsView(e)))

const dayTotalHours = computed(() =>
  props.entries
    .filter((e) => e.entryType === 'Working' && !e.allDay)
    .reduce((sum, e) => sum + durationHours(e.startTime, e.endTime), 0),
)

const isToday = computed(() => toISODate(props.date) === toISODate(new Date()))

// An all-day Vacation entry credits the full daily target, same as the
// overall balance does - the day reads as "on target", not a shortfall.
const hasVacationCredit = computed(() => props.entries.some((e) => e.entryType === 'Vacation' && e.allDay))

const dailyDiffHours = computed(() =>
  hasVacationCredit.value ? 0 : dayTotalHours.value - props.dailyTargetHours,
)

const dailyStatus = computed(() => {
  if (dailyDiffHours.value >= 0) return 'green' // goal reached or exceeded
  const shortfall = Math.abs(dailyDiffHours.value)
  return shortfall > DAILY_RED_THRESHOLD_HOURS ? 'red' : 'yellow'
})

const breakWarning = computed(() => computeBreakWarning(props.entries))

const breakWarningTitle = computed(() => {
  if (!breakWarning.value) return ''
  const { workHours, actualBreakMinutes, requiredBreakMinutes } = breakWarning.value
  return `Worked ${formatHours(workHours)} with only ${actualBreakMinutes}min break planned — Swiss law requires at least ${requiredBreakMinutes}min.`
})

const showBreakPopup = ref(false)
const showHiddenPopup = ref(false)

function toggleBreakPopup() {
  showBreakPopup.value = !showBreakPopup.value
}

function toggleHiddenPopup() {
  showHiddenPopup.value = !showHiddenPopup.value
}

function closePopups() {
  showBreakPopup.value = false
  showHiddenPopup.value = false
}

function handleHiddenEntryClick(entry) {
  closePopups()
  emit('edit', entry)
}

onMounted(() => document.addEventListener('click', closePopups))
onBeforeUnmount(() => document.removeEventListener('click', closePopups))

function formatDiff(hours) {
  if (Math.abs(hours) < 0.01) return 'on target'
  const sign = hours > 0 ? '+' : '-'
  const abs = Math.abs(hours)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  if (h === 0) return `${sign}${m}m`
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}

function blockStyle(entry) {
  const { start, end } = entryRange(entry)
  const clippedStart = Math.max(start, props.viewFromHour)
  const clippedEnd = Math.min(end, props.viewTillHour)
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  return {
    left: `${((clippedStart - props.viewFromHour) / rangeSpan.value) * 100}%`,
    width: `${((clippedEnd - clippedStart) / rangeSpan.value) * 100}%`,
    backgroundColor: style.bg,
    color: style.text,
    borderColor: style.border,
  }
}

function bannerStyle(entry) {
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  return {
    backgroundColor: style.bg,
    color: style.text,
    borderColor: style.border,
  }
}

const LOCATION_ICONS = { Office: '💼', Remote: '🏠' }

// Left side: <icon> Title (or Entry Type if no title) - Notes. Work Location
// shows as an icon prefix instead of "(Office)" text, and is omitted
// entirely when unset - same for Notes when there's none.
function entryLeftLabel(entry) {
  let label = entry.title || entry.entryType
  if (entry.notes) label += ` - ${entry.notes}`
  const icon = LOCATION_ICONS[entry.workLocation]
  return icon ? `${icon} ${label}` : label
}

// Right side: total duration, with the exact time range in brackets - or
// "All Day" for all-day entries.
function entryRightLabel(entry) {
  if (entry.allDay) return 'All Day'
  const duration = formatHours(durationHours(entry.startTime, entry.endTime))
  const range = `${entry.startTime?.slice(0, 5)}-${entry.endTime?.slice(0, 5)}`
  return `${duration} (${range})`
}
</script>

<template>
  <section class="day-table" :class="{ 'is-today': isToday }">
    <header class="day-heading">
      <div class="heading-left">
        <h3>{{ formatDayHeading(date) }}</h3>
        <span v-if="breakWarning" class="break-warning-wrap">
          <button type="button" class="break-warning" :title="breakWarningTitle" @click.stop="toggleBreakPopup">
            ⚠ Insufficient break
          </button>
          <div v-if="showBreakPopup" class="break-popup" @click.stop>{{ breakWarningTitle }}</div>
        </span>
        <span v-if="hiddenTimedEntries.length > 0" class="break-warning-wrap">
          <button type="button" class="hidden-warning" @click.stop="toggleHiddenPopup">
            {{ hiddenTimedEntries.length }} entr{{ hiddenTimedEntries.length === 1 ? 'y' : 'ies' }} outside view
          </button>
          <div v-if="showHiddenPopup" class="break-popup hidden-popup" @click.stop>
            <button
              v-for="entry in hiddenTimedEntries"
              :key="entry.id"
              type="button"
              class="hidden-entry-item"
              @click="handleHiddenEntryClick(entry)"
            >
              {{ entryLeftLabel(entry) }} — {{ entryRightLabel(entry) }}
            </button>
          </div>
        </span>
      </div>
      <button class="add-btn" type="button" @click="emit('add', date)">+ Add</button>
    </header>

    <table>
      <thead>
        <tr>
          <th v-for="h in visibleHours" :key="h" class="hour-label">{{ h }}</th>
          <th class="total-label">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in allDayEntries" :key="'allday-' + entry.id" class="all-day-row">
          <td :colspan="visibleHours.length" class="all-day-cell" :style="bannerStyle(entry)" @click="emit('edit', entry)">
            <div class="block-content">
              <span class="block-left">{{ entryLeftLabel(entry) }}</span>
              <span class="block-right">{{ entryRightLabel(entry) }}</span>
            </div>
          </td>
          <td class="total-cell">&mdash;</td>
        </tr>
        <tr class="timeline-row">
          <td :colspan="visibleHours.length" class="hour-track">
            <div class="track-grid">
              <span v-for="h in visibleHours" :key="h" class="grid-line"></span>
            </div>
            <div class="blocks">
              <div
                v-for="entry in visibleTimedEntries"
                :key="entry.id"
                class="block"
                :style="blockStyle(entry)"
                :title="`${entryLeftLabel(entry)} — ${entryRightLabel(entry)}`"
                @click="emit('edit', entry)"
              >
                <div class="block-content">
                  <span class="block-left">{{ entryLeftLabel(entry) }}</span>
                  <span class="block-right">{{ entryRightLabel(entry) }}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="total-cell">
            <div>{{ formatHours(dayTotalHours) }}</div>
            <div v-if="showGoalDiff" class="goal-diff" :class="'status-' + dailyStatus">
              {{ formatDiff(dailyDiffHours) }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.day-table {
  position: relative;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  background: var(--color-background-soft);
}

/* Border stays the same as any other card - the gradient becomes a soft,
   blurred glow sitting behind it instead of an outline. An oversized
   linear-gradient sliding via background-position (not a rotated shape or
   an @property-animated angle) - the most broadly-supported way to get a
   continuously "flowing" gradient, no feature-detection gaps involved. */
.day-table.is-today::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 12px;
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
  filter: blur(12px);
  opacity: 0.85;
  z-index: -1;
  animation: rotate-today-border 24s linear infinite;
  pointer-events: none;
}

@keyframes rotate-today-border {
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

.day-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.day-heading h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
}

.heading-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.break-warning-wrap {
  position: relative;
  display: inline-flex;
}

.break-warning {
  font-size: 0.7rem;
  font-weight: 600;
  color: #f59e0b;
  background: transparent;
  border: 1px solid #f59e0b;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  font-family: inherit;
}

.break-popup {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  z-index: 10;
  width: max-content;
  max-width: 16rem;
  background: var(--color-background);
  border: 1px solid #f59e0b;
  border-radius: 6px;
  padding: 0.5rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text);
  text-align: left;
  white-space: normal;
  cursor: default;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.hidden-warning {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.75;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  font-family: inherit;
}

.hidden-popup {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.4rem;
  border-color: var(--color-border);
}

.hidden-entry-item {
  text-align: left;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  color: var(--color-text);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
}

.hidden-entry-item:hover {
  border-color: var(--color-border-hover);
}

.add-btn {
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 5px;
  border: 1px solid #1d4ed8;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
}

.add-btn:hover {
  background: #2563eb;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.hour-label {
  font-size: 0.65rem;
  font-weight: 400;
  color: var(--color-text);
  opacity: 0.6;
  text-align: center;
  padding-bottom: 0.25rem;
  /* No explicit width - table-layout: fixed auto-distributes the remaining
     space evenly among however many hour columns are currently visible. */
}

.total-label {
  font-size: 0.7rem;
  text-align: center;
  width: 4.5rem;
}

.hour-track {
  position: relative;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.track-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.grid-line {
  flex: 1;
  border-right: 1px solid var(--color-border);
}

.grid-line:last-child {
  border-right: none;
}

.blocks {
  position: absolute;
  inset: 2px;
}

.block {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 1px solid;
  border-radius: 3px;
  font-size: 0.7rem;
  line-height: 1.4;
  padding: 0.3rem 0.35rem;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.block-content {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  overflow: hidden;
}

.block-left {
  flex-shrink: 1;
  min-width: 1.5em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.block-right {
  flex-shrink: 10;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  opacity: 0.85;
}

.total-cell {
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  width: 4.5rem;
  white-space: nowrap;
}

.goal-diff {
  font-size: 0.65rem;
  font-weight: 600;
  margin-top: 0.15rem;
}

.goal-diff.status-green {
  color: #16a34a;
}

.goal-diff.status-yellow {
  color: #ca8a04;
}

.goal-diff.status-red {
  color: #dc2626;
}

.all-day-row .all-day-cell {
  border-radius: 4px;
  border: 1px solid;
  font-size: 0.75rem;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}

.all-day-row td {
  padding-bottom: 0.35rem;
}
</style>
