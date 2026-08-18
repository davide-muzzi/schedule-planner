<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { TriangleAlert, StickyNote, Briefcase, House } from '@lucide/vue'
import { durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'
import { DAILY_RED_THRESHOLD_HOURS } from '@/utils/constants'
import { computeBreakWarning } from '@/utils/breakRules'
import { showToast } from '@/utils/toast'

const props = defineProps({
  date: { type: Date, required: true },
  entries: { type: Array, default: () => [] },
  showGoalDiff: { type: Boolean, default: false },
  dailyTargetHours: { type: Number, required: true },
  viewFromHour: { type: Number, required: true },
  viewTillHour: { type: Number, required: true },
  entryTypeColors: { type: Object, required: true },
})

const emit = defineEmits(['add', 'edit', 'clear-day', 'resize-entry'])

// The timeline zoom is purely visual - visibleHours only drives the header
// labels, grid lines, and block positioning math below. Totals, the daily
// goal diff, and the break-law check all keep operating on the real,
// unfiltered entry data regardless of what's currently zoomed into view.
const visibleHours = computed(() =>
  Array.from({ length: props.viewTillHour - props.viewFromHour }, (_, i) => props.viewFromHour + i),
)
const rangeSpan = computed(() => props.viewTillHour - props.viewFromHour)

// Grid lines stay hourly (drag/resize still snaps that fine), but a label
// at every hour is too busy - only mark every 3rd hour, aligned to the
// clock (0/3/6/9/...) rather than relative to the current view range.
const labeledHours = computed(() => visibleHours.value.filter((h) => h % 3 === 0))

function hourLabelLeft(h) {
  return `${((h - props.viewFromHour) / rangeSpan.value) * 100}%`
}

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

const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const weekdayAbbrev = computed(() => WEEKDAY_ABBR[props.date.getDay()])
const monthDayLabel = computed(() => props.date.toLocaleString(undefined, { month: 'short', day: 'numeric' }))

// An all-day Vacation entry credits the full daily target, same as the
// overall balance does - the day reads as "on target", not a shortfall.
const hasVacationCredit = computed(() => props.entries.some((e) => e.entryType === 'Vacation' && e.allDay))

const dailyDiffHours = computed(() =>
  hasVacationCredit.value ? 0 : dayTotalHours.value - props.dailyTargetHours,
)

const dailyStatus = computed(() => {
  if (dayTotalHours.value === 0) return null // nothing logged yet - not a shortfall worth flagging
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

// --- Timeline drag interactions (create by dragging empty space, move/resize
// existing entries) -------------------------------------------------------

const trackEl = ref(null)
const dragMode = ref(null) // null | 'create' | 'resize-start' | 'resize-end' | 'move'
const dragEntry = ref(null) // the entry being resized/moved - null while creating
const dragAnchorHours = ref(0) // create only: the time under the mouse at mousedown
const dragPreviewStart = ref(0)
const dragPreviewEnd = ref(0)
const dragGrabOffsetHours = ref(0) // move only: time-under-cursor minus entry.start at mousedown

const MIN_DURATION_HOURS = 1 / 60

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hoursFromClientX(clientX) {
  if (!trackEl.value) return props.viewFromHour
  const rect = trackEl.value.getBoundingClientRect()
  const fraction = clamp((clientX - rect.left) / rect.width, 0, 1)
  return props.viewFromHour + fraction * rangeSpan.value
}

// Ctrl = 5min grid, otherwise exact to 1min.
function snapHours(hours, ctrlKey) {
  const grid = ctrlKey ? 5 / 60 : 1 / 60
  return Math.round(hours / grid) * grid
}

// Edge drags: a start-edge can only ever come to rest at a neighbor's END
// (snapping it to the neighbor's own start would nest it inside that span
// and always overlap), and an end-edge can only ever come to rest at a
// neighbor's START, for the same reason in reverse. Which half of the
// neighbor you're hovering doesn't matter here - only one boundary is ever
// a valid target.
function magnetSnapForStart(hours, excludeId) {
  for (const other of timedEntries.value) {
    if (other.id === excludeId) continue
    const { start, end } = entryRange(other)
    if (hours > start && hours < end) return end
  }
  return hours
}

function magnetSnapForEnd(hours, excludeId) {
  for (const other of timedEntries.value) {
    if (other.id === excludeId) continue
    const { start, end } = entryRange(other)
    if (hours > start && hours < end) return start
  }
  return hours
}

// Whole-entry move: which half of a hovered neighbor the cursor is over
// decides which of the dragged entry's edges gets pinned to that neighbor's
// boundary - left half pins the dragged entry's end to the neighbor's
// start, right half pins its start to the neighbor's end. Returns null when
// the cursor isn't currently over any neighbor.
function moveMagnetTarget(rawHours, duration, excludeId) {
  for (const other of timedEntries.value) {
    if (other.id === excludeId) continue
    const { start, end } = entryRange(other)
    if (rawHours > start && rawHours < end) {
      const mid = (start + end) / 2
      return rawHours < mid ? { start: start - duration, end: start } : { start: end, end: end + duration }
    }
  }
  return null
}

function hasOverlap(start, end, excludeId) {
  return timedEntries.value.some((e) => {
    if (e.id === excludeId) return false
    const r = entryRange(e)
    return start < r.end && end > r.start
  })
}

function hoursToTimeString(hours) {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function effectiveRange(entry) {
  if (dragEntry.value?.id === entry.id && dragMode.value && dragMode.value !== 'create') {
    return { start: dragPreviewStart.value, end: dragPreviewEnd.value }
  }
  return entryRange(entry)
}

function startDragListeners() {
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function stopDragListeners() {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

onBeforeUnmount(stopDragListeners)

function handleTrackMouseDown(event) {
  event.preventDefault() // stops the browser's native text-selection drag from kicking in
  const start = snapHours(hoursFromClientX(event.clientX), event.ctrlKey)
  dragMode.value = 'create'
  dragEntry.value = null
  dragAnchorHours.value = start
  dragPreviewStart.value = start
  dragPreviewEnd.value = start
  startDragListeners()
}

function handleBlockMouseDown(event, entry) {
  event.preventDefault()
  const { start, end } = entryRange(entry)
  dragMode.value = 'move'
  dragEntry.value = entry
  dragGrabOffsetHours.value = hoursFromClientX(event.clientX) - start
  dragPreviewStart.value = start
  dragPreviewEnd.value = end
  startDragListeners()
}

function handleEdgeMouseDown(event, entry, edge) {
  event.preventDefault()
  const { start, end } = entryRange(entry)
  dragMode.value = edge === 'start' ? 'resize-start' : 'resize-end'
  dragEntry.value = entry
  dragPreviewStart.value = start
  dragPreviewEnd.value = end
  startDragListeners()
}

function handleDragMove(event) {
  const raw = hoursFromClientX(event.clientX)
  const snapped = snapHours(raw, event.ctrlKey)

  if (dragMode.value === 'create') {
    dragPreviewStart.value = Math.min(dragAnchorHours.value, snapped)
    dragPreviewEnd.value = Math.max(dragAnchorHours.value, snapped)
  } else if (dragMode.value === 'resize-start') {
    const magnet = magnetSnapForStart(snapped, dragEntry.value.id)
    dragPreviewStart.value = Math.min(magnet, dragPreviewEnd.value - MIN_DURATION_HOURS)
  } else if (dragMode.value === 'resize-end') {
    const magnet = magnetSnapForEnd(snapped, dragEntry.value.id)
    dragPreviewEnd.value = Math.max(magnet, dragPreviewStart.value + MIN_DURATION_HOURS)
  } else if (dragMode.value === 'move') {
    const { start: origStart, end: origEnd } = entryRange(dragEntry.value)
    const duration = origEnd - origStart
    const magnet = moveMagnetTarget(raw, duration, dragEntry.value.id)
    let newStart = magnet ? magnet.start : snapHours(raw - dragGrabOffsetHours.value, event.ctrlKey)
    newStart = clamp(newStart, props.viewFromHour, props.viewTillHour - duration)
    dragPreviewStart.value = newStart
    dragPreviewEnd.value = newStart + duration
  }
}

function handleDragEnd() {
  stopDragListeners()

  const mode = dragMode.value
  const entry = dragEntry.value
  const start = dragPreviewStart.value
  const end = dragPreviewEnd.value

  dragMode.value = null
  dragEntry.value = null

  if (mode === 'create') {
    if (end - start < MIN_DURATION_HOURS) return // negligible drag - treat as a plain click, do nothing
    if (hasOverlap(start, end, null)) {
      showToast('This time range overlaps with an existing entry.')
      return
    }
    emit('add', props.date, { startTime: hoursToTimeString(start), endTime: hoursToTimeString(end) })
    return
  }

  const original = entryRange(entry)
  const changed = Math.abs(start - original.start) > 1e-6 || Math.abs(end - original.end) > 1e-6
  if (!changed) {
    emit('edit', entry) // no real drag happened - treat it as a click
    return
  }
  if (hasOverlap(start, end, entry.id)) {
    showToast('This time range overlaps with an existing entry.')
    return
  }
  emit('resize-entry', entry.id, hoursToTimeString(start), hoursToTimeString(end))
}

function handleClearDayClick() {
  if (props.entries.length === 0) return
  if (!window.confirm(`Delete all ${props.entries.length} entr${props.entries.length === 1 ? 'y' : 'ies'} on this day? This cannot be undone.`))
    return
  emit('clear-day', props.date)
}

function blockStyle(entry) {
  const { start, end } = effectiveRange(entry)
  const clippedStart = Math.max(start, props.viewFromHour)
  const clippedEnd = Math.min(end, props.viewTillHour)
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  return {
    left: `${((clippedStart - props.viewFromHour) / rangeSpan.value) * 100}%`,
    width: `${((clippedEnd - clippedStart) / rangeSpan.value) * 100}%`,
    backgroundColor: style.bg,
    color: style.text,
  }
}

function ghostStyle() {
  const clippedStart = Math.max(dragPreviewStart.value, props.viewFromHour)
  const clippedEnd = Math.min(dragPreviewEnd.value, props.viewTillHour)
  return {
    left: `${((clippedStart - props.viewFromHour) / rangeSpan.value) * 100}%`,
    width: `${((clippedEnd - clippedStart) / rangeSpan.value) * 100}%`,
  }
}

function bannerStyle(entry) {
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  return {
    backgroundColor: style.bg,
    color: style.text,
  }
}

const LOCATION_ICONS = { Office: Briefcase, Remote: House }

// The work-location icon component for this entry (rendered separately in
// the template, alongside the plain-text labels below), or null if unset.
function locationIcon(entry) {
  return LOCATION_ICONS[entry.workLocation] || null
}

// Left side: Title (or Entry Type if no title) - Notes. Notes are omitted
// entirely when there's none.
function entryLeftLabel(entry) {
  const label = entry.title || entry.entryType
  return entry.notes ? `${label} - ${entry.notes}` : label
}

// Row 1 of a timeline block - same as entryLeftLabel but without the notes
// text, since notes get their own icon instead (there's rarely room for
// both on a block this narrow).
function blockTitleLabel(entry) {
  return entry.title || entry.entryType
}

// Right side / row 2: total duration, with the exact time range in brackets
// - or "All Day" for all-day entries.
function entryRightLabel(entry) {
  if (entry.allDay) return 'All Day'
  const duration = formatHours(durationHours(entry.startTime, entry.endTime))
  const range = `${entry.startTime?.slice(0, 5)}-${entry.endTime?.slice(0, 5)}`
  return `${duration} (${range})`
}

// Same as entryRightLabel, but while this entry is being moved/resized it
// reads from the live drag preview instead of the entry's saved times, so
// the label updates in real time as you drag.
function blockTimeLabel(entry) {
  const isDraggingThis =
    dragEntry.value?.id === entry.id &&
    (dragMode.value === 'move' || dragMode.value === 'resize-start' || dragMode.value === 'resize-end')
  if (!isDraggingThis) return entryRightLabel(entry)

  const duration = formatHours(dragPreviewEnd.value - dragPreviewStart.value)
  const range = `${hoursToTimeString(dragPreviewStart.value)}-${hoursToTimeString(dragPreviewEnd.value)}`
  return `${duration} (${range})`
}
</script>

<template>
  <section class="day-table" :class="{ 'is-today': isToday }">
    <div class="day-body">
      <div class="day-info">
        <span class="day-weekday">{{ weekdayAbbrev }}</span>
        <span class="day-date">{{ monthDayLabel }}</span>
        <span v-if="breakWarning" class="break-warning-wrap">
          <button type="button" class="break-warning" :title="breakWarningTitle" @click.stop="toggleBreakPopup">
            <TriangleAlert :size="12" />
          </button>
          <div v-if="showBreakPopup" class="break-popup" @click.stop>{{ breakWarningTitle }}</div>
        </span>
        <span v-if="hiddenTimedEntries.length > 0" class="break-warning-wrap">
          <button type="button" class="hidden-warning" @click.stop="toggleHiddenPopup">
            {{ hiddenTimedEntries.length }} hidden
          </button>
          <div v-if="showHiddenPopup" class="break-popup hidden-popup" @click.stop>
            <button
              v-for="entry in hiddenTimedEntries"
              :key="entry.id"
              type="button"
              class="hidden-entry-item"
              @click="handleHiddenEntryClick(entry)"
            >
              <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="12" class="inline-icon" />
              {{ entryLeftLabel(entry) }} — {{ entryRightLabel(entry) }}
            </button>
          </div>
        </span>
      </div>

      <table class="timeline-table">
        <thead>
          <tr>
            <th :colspan="visibleHours.length" class="hour-labels-cell">
              <span
                v-for="h in labeledHours"
                :key="h"
                class="hour-label"
                :style="{ left: hourLabelLeft(h) }"
              >{{ h }}:00</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in allDayEntries" :key="'allday-' + entry.id" class="all-day-row">
            <td :colspan="visibleHours.length" class="all-day-cell" :style="bannerStyle(entry)" @click="emit('edit', entry)">
              <div class="block-content">
                <span class="block-left">
                  <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="13" class="inline-icon" />
                  {{ entryLeftLabel(entry) }}
                </span>
                <span class="block-right">{{ entryRightLabel(entry) }}</span>
              </div>
            </td>
          </tr>
          <tr class="timeline-row">
            <td :colspan="visibleHours.length" class="hour-track-cell">
              <div class="hour-track" ref="trackEl" @mousedown="handleTrackMouseDown">
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
                  @mousedown.stop="handleBlockMouseDown($event, entry)"
                >
                  <div
                    class="resize-handle left"
                    :class="{ active: dragMode === 'resize-start' && dragEntry?.id === entry.id }"
                    @mousedown.stop="handleEdgeMouseDown($event, entry, 'start')"
                  ></div>
                  <div
                    class="resize-handle right"
                    :class="{ active: dragMode === 'resize-end' && dragEntry?.id === entry.id }"
                    @mousedown.stop="handleEdgeMouseDown($event, entry, 'end')"
                  ></div>
                  <div class="block-content">
                    <span class="block-title">
                      <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="11" class="inline-icon" />
                      {{ blockTitleLabel(entry) }}
                    </span>
                    <span class="block-time">{{ blockTimeLabel(entry) }}</span>
                  </div>
                  <StickyNote v-if="entry.notes" class="note-icon" :size="10" :title="entry.notes" />
                </div>
                <div v-if="dragMode === 'create'" class="drag-ghost" :style="ghostStyle()"></div>
              </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="day-stats">
        <div class="total-value-row stat-box">
          <span class="total-value" :class="showGoalDiff && dailyStatus ? 'status-' + dailyStatus : ''">{{ formatHours(dayTotalHours) }}</span>
          <span v-if="showGoalDiff" class="total-value-target">/ {{ formatHours(dailyTargetHours) }}</span>
        </div>
        <div v-if="showGoalDiff && dailyStatus" class="goal-diff stat-box" :class="'status-' + dailyStatus">
          {{ formatDiff(dailyDiffHours) }}
        </div>
        <div class="day-actions">
          <button type="button" class="clear-day-btn" :disabled="entries.length === 0" @click="handleClearDayClick">
            Clear
          </button>
          <button class="add-btn" type="button" @click="emit('add', date)">+ Add</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.day-table {
  position: relative;
  margin-bottom: 1.5rem;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  background: var(--color-background-soft);
}

.day-body {
  display: flex;
  align-items: stretch;
  gap: 0.9rem;
}

.day-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.3rem;
  min-width: 3.5rem;
  text-align: center;
}

.day-weekday {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--color-heading);
}

.day-date {
  font-size: 0.85rem;
  opacity: 0.65;
}

/* Same oversized linear-gradient + background-position technique as the
   Today button's text (WeekSummary.vue) - no glow/border, the animated
   gradient is clipped to the weekday text itself instead. */
.day-table.is-today .day-weekday {
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
  animation: today-heading-gradient 24s linear infinite;
}

@keyframes today-heading-gradient {
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

.day-actions {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.15rem;
}

.clear-day-btn,
.add-btn {
  flex: 1;
}

.clear-day-btn,
.add-btn {
  height: 1.6rem;
  font-size: 0.75rem;
  padding: 0 0.55rem;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
}

.clear-day-btn {
  border: 2px solid #dc2626;
  background: var(--color-background);
  color: #dc2626;
}

.clear-day-btn:hover {
  background: #dc2626;
  color: #fff;
}

.clear-day-btn:disabled {
  opacity: 0.4;
  cursor: default;
  background: var(--color-background);
  color: #dc2626;
}

.add-btn {
  border: none;
  background: #3b82f6;
  color: #fff;
}

.add-btn:hover {
  background: #2563eb;
}

.timeline-table {
  flex: 1;
  min-width: 0;
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.hour-labels-cell {
  position: relative;
  height: 1.4rem;
  padding: 0 0 0.25rem;
}

.hour-label {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 0.65rem;
  font-weight: 400;
  color: var(--color-text);
  opacity: 0.6;
  white-space: nowrap;
}

.hour-label::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  width: 2px;
  height: 9px;
  background: rgba(255, 255, 255, 0.45);
  transform: translateX(-50%);
}

.hour-track-cell {
  padding: 0;
}

.hour-track {
  position: relative;
  height: 3.25rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: crosshair;
  user-select: none;
  overflow: hidden;
  background: var(--color-background);
}

.track-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.grid-line {
  flex: 1;
  border-right: 2px solid var(--color-border);
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
  top: 5px;
  bottom: 5px;
  border: none;
  border-radius: 3px;
  font-size: 0.7rem;
  line-height: 1.35;
  padding: 0.3rem 0.35rem 0.3rem 0.65rem;
  overflow: hidden;
  cursor: grab;
  display: flex;
  align-items: center;
  container-type: inline-size;
}

.block:active {
  cursor: grabbing;
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
  background: transparent;
  transition: background-color 0.1s ease;
}

.resize-handle:hover,
.resize-handle.active {
  background: rgba(255, 255, 255, 0.45);
}

.resize-handle.left {
  left: 0;
  border-radius: 3px 0 0 3px;
}

.resize-handle.right {
  right: 0;
  border-radius: 0 3px 3px 0;
}

.drag-ghost {
  position: absolute;
  top: 5px;
  bottom: 5px;
  border: 2px dashed var(--color-heading);
  border-radius: 3px;
  background: transparent;
  pointer-events: none;
}

.block-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.1rem;
  width: 100%;
  overflow: hidden;
}

.block-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
}

.block-time {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.85;
  font-size: 0.9em;
}

/* "5 chars before it'd need an ellipsis" is a rough width, not a literal
   character count - measured off the block's own rendered width via a
   container query so it stays correct across every zoom level/window size. */
@container (max-width: 52px) {
  .block-content,
  .note-icon {
    display: none;
  }
}

.note-icon {
  position: absolute;
  top: 3px;
  right: 3px;
  opacity: 0.85;
  pointer-events: none;
}

.inline-icon {
  vertical-align: -2px;
  margin-right: 0.15rem;
  flex-shrink: 0;
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

.day-stats {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 0.35rem;
  min-width: 7rem;
  white-space: nowrap;
}

/* Stretched to match the width of .day-actions below (the widest row in
   this column, since day-stats shrink-wraps to its widest child) - gives
   the total/diff rows a box spanning the same width as Clear+Add combined. */
.stat-box {
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
  text-align: center;
  background: var(--color-background);
}

.total-value-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
}

.total-value {
  font-size: 0.8rem;
  font-weight: 600;
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

.total-value-target {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.55;
}

.goal-diff {
  font-size: 0.65rem;
  font-weight: 600;
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
  border: none;
  font-size: 0.75rem;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}

.all-day-row td {
  padding-bottom: 0.35rem;
}
</style>
