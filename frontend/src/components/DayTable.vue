<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatDayHeading, durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
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
    borderColor: style.border,
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

// Row 1 of a timeline block - same as entryLeftLabel but without the notes
// text, since notes get their own icon instead (there's rarely room for
// both on a block this narrow).
function blockTitleLabel(entry) {
  const label = entry.title || entry.entryType
  const icon = LOCATION_ICONS[entry.workLocation]
  return icon ? `${icon} ${label}` : label
}

// Right side / row 2: total duration, with the exact time range in brackets
// - or "All Day" for all-day entries.
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
      <div class="header-actions">
        <button type="button" class="clear-day-btn" :disabled="entries.length === 0" @click="handleClearDayClick">
          Clear Day
        </button>
        <button class="add-btn" type="button" @click="emit('add', date)">+ Add</button>
      </div>
    </header>

    <table>
      <thead>
        <tr>
          <th v-for="h in visibleHours" :key="h" class="hour-label">{{ h }}</th>
          <th class="total-label"></th>
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
          <td :colspan="visibleHours.length" class="hour-track" ref="trackEl" @mousedown="handleTrackMouseDown">
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
                <div class="resize-handle left" @mousedown.stop="handleEdgeMouseDown($event, entry, 'start')"></div>
                <div class="resize-handle right" @mousedown.stop="handleEdgeMouseDown($event, entry, 'end')"></div>
                <div class="block-content">
                  <span class="block-title">{{ blockTitleLabel(entry) }}</span>
                  <span class="block-time">{{ entryRightLabel(entry) }}</span>
                </div>
                <span v-if="entry.notes" class="note-icon" :title="entry.notes">📝</span>
              </div>
              <div v-if="dragMode === 'create'" class="drag-ghost" :style="ghostStyle()"></div>
            </div>
          </td>
          <td class="total-cell">
            <div class="total-value-row">
              <span class="total-value" :class="showGoalDiff && dailyStatus ? 'status-' + dailyStatus : ''">{{ formatHours(dayTotalHours) }}</span>
              <span v-if="showGoalDiff" class="total-value-target">/ {{ formatHours(dailyTargetHours) }}</span>
            </div>
            <div v-if="showGoalDiff && dailyStatus" class="goal-diff" :class="'status-' + dailyStatus">
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

/* Same oversized linear-gradient + background-position technique as the
   Today button's text (WeekSummary.vue) - no glow/border, the animated
   gradient is clipped to the heading text itself instead. */
.day-table.is-today .day-heading h3 {
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

.heading-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.clear-day-btn {
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 5px;
  border: 1px solid #dc2626;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-family: inherit;
}

.clear-day-btn:hover {
  background: #dc2626;
  color: #fff;
}

.clear-day-btn:disabled {
  opacity: 0.4;
  cursor: default;
  background: transparent;
  color: #dc2626;
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
  width: 7.5rem;
}

.hour-track {
  position: relative;
  height: 3.75rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: crosshair;
  user-select: none;
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
  line-height: 1.35;
  padding: 0.3rem 0.35rem;
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
}

.resize-handle.left {
  left: 0;
}

.resize-handle.right {
  right: 0;
}

.drag-ghost {
  position: absolute;
  top: 0;
  bottom: 0;
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
@container (max-width: 46px) {
  .block-content,
  .note-icon {
    display: none;
  }
}

.note-icon {
  position: absolute;
  top: 1px;
  right: 3px;
  font-size: 0.6rem;
  opacity: 0.85;
  pointer-events: none;
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
  width: 7.5rem;
  white-space: nowrap;
}

.total-value-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
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
