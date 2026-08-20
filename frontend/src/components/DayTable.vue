<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { TriangleAlert, StickyNote, Briefcase, House, Eraser, Plus } from '@lucide/vue'
import { durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'
import { DAILY_RED_THRESHOLD_HOURS } from '@/utils/constants'
import { computeBreakWarning } from '@/utils/breakRules'
import { showToast } from '@/utils/toast'

const props = defineProps({
  date: { type: Date, required: true },
  rowIndex: { type: Number, default: 0 }, // position within the visible week - staggers this row's own enter and its blocks' reveal
  entries: { type: Array, default: () => [] },
  showGoalDiff: { type: Boolean, default: false },
  dailyTargetHours: { type: Number, required: true },
  viewFromHour: { type: Number, required: true },
  viewTillHour: { type: Number, required: true },
  entryTypeColors: { type: Object, required: true },
})

const emit = defineEmits(['add', 'edit', 'clear-day', 'resize-entry'])

// The set of entries this row's initial cascade belongs to. Not simply
// "whatever props.entries held at setup()" - the store's initial fetch is
// async, so this component mounts before real data arrives and an
// empty-at-setup snapshot would make every entry look "newly added" and
// skip the stagger entirely. Instead, wait for the first non-empty entries
// list (real data, whether that's the initial load or an already-warm
// store on week navigation) and lock that in as "the cascade" - anything
// with an id outside it was added afterward via the "+" button, and gets a
// plain immediate growX instead of joining the mount-time cascade, so
// adding one entry never restages its siblings.
let initialEntryIds = new Set()
let capturedInitialEntries = false
watch(
  () => props.entries,
  (entries) => {
    if (capturedInitialEntries || entries.length === 0) return
    capturedInitialEntries = true
    initialEntryIds = new Set(entries.map((e) => e.id))
  },
  { immediate: true },
)

function blockDelay(entry, entryIndex) {
  if (!initialEntryIds.has(entry.id)) return '0ms'
  return `${props.rowIndex * 55 + 120 + entryIndex * 60}ms`
}

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

// Current-time indicator line, only shown on today's card. Re-synced on
// every real minute boundary (not a plain 60s interval) so it can't drift.
const now = ref(new Date())
let nowTimeoutId = null

function scheduleNowUpdate() {
  const msUntilNextMinute = 60000 - (Date.now() % 60000)
  nowTimeoutId = setTimeout(() => {
    now.value = new Date()
    scheduleNowUpdate()
  }, msUntilNextMinute)
}

onMounted(scheduleNowUpdate)
onBeforeUnmount(() => clearTimeout(nowTimeoutId))

const nowLinePosition = computed(() => {
  if (!isToday.value) return null
  const hours = now.value.getHours() + now.value.getMinutes() / 60
  if (hours < props.viewFromHour || hours > props.viewTillHour) return null
  return `${((hours - props.viewFromHour) / rangeSpan.value) * 100}%`
})

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

// Clamps a moving edge so it can never cross past the nearest existing
// entry lying between `reference` (a fixed point that doesn't move during
// this drag - the anchor for a create-drag, the entry's own untouched
// opposite edge for a resize) and `target` (the raw, unclamped pointer
// position). Scans every entry in that swept range rather than just
// checking whether the pointer currently sits inside one - a fast drag can
// jump clean over a neighbor's whole width between two mousemove events, so
// "does the raw position fall inside a neighbor right now" can miss it and
// let the edge land past (or inside) it. This always finds the *nearest*
// boundary in the direction of travel, so nothing gets skipped no matter
// how far or fast the pointer moves.
function clampToNearestEntry(target, reference, excludeId) {
  if (target > reference) {
    let limit = target
    for (const other of timedEntries.value) {
      if (other.id === excludeId) continue
      const { start } = entryRange(other)
      if (start >= reference && start < limit) limit = start
    }
    return limit
  }
  if (target < reference) {
    let limit = target
    for (const other of timedEntries.value) {
      if (other.id === excludeId) continue
      const { end } = entryRange(other)
      if (end <= reference && end > limit) limit = end
    }
    return limit
  }
  return target
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
    // Same boundary-clamping as resizing - whichever edge is moving (the
    // anchor stays put) can never cross past the nearest neighbor in that
    // direction, no matter how far past it the pointer moves.
    if (snapped >= dragAnchorHours.value) {
      dragPreviewStart.value = dragAnchorHours.value
      dragPreviewEnd.value = clampToNearestEntry(snapped, dragAnchorHours.value, null)
    } else {
      dragPreviewEnd.value = dragAnchorHours.value
      dragPreviewStart.value = clampToNearestEntry(snapped, dragAnchorHours.value, null)
    }
  } else if (dragMode.value === 'resize-start') {
    const magnet = clampToNearestEntry(snapped, entryRange(dragEntry.value).start, dragEntry.value.id)
    dragPreviewStart.value = Math.min(magnet, dragPreviewEnd.value - MIN_DURATION_HOURS)
  } else if (dragMode.value === 'resize-end') {
    const magnet = clampToNearestEntry(snapped, entryRange(dragEntry.value).end, dragEntry.value.id)
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
    let rangeStart = start
    let rangeEnd = end
    if (rangeEnd - rangeStart < MIN_DURATION_HOURS) {
      // Plain click, no real drag - same as dragging across the full hour
      // the click landed in.
      rangeStart = Math.floor(dragAnchorHours.value)
      rangeEnd = Math.min(24, rangeStart + 1)
      if (rangeEnd - rangeStart < MIN_DURATION_HOURS) return // clicked right at the 24:00 edge
    }
    if (hasOverlap(rangeStart, rangeEnd, null)) {
      showToast('This time range overlaps with an existing entry.')
      return
    }
    emit('add', props.date, { startTime: hoursToTimeString(rangeStart), endTime: hoursToTimeString(rangeEnd) })
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

// Same shape as formatHours, but the leading "0h" is redundant clutter on a
// sub-hour entry (e.g. a 30-minute break) - dropped whenever there isn't a
// whole hour to show. Scoped to timeline entry labels only, not the shared
// util used for day/week totals elsewhere.
function formatBlockDuration(hours) {
  const formatted = formatHours(hours)
  return formatted.startsWith('0h ') ? formatted.slice(3) : formatted
}

// Right side / row 2: total duration, with the exact time range in brackets
// - or "All Day" for all-day entries.
function entryRightLabel(entry) {
  if (entry.allDay) return 'All Day'
  const duration = formatBlockDuration(durationHours(entry.startTime, entry.endTime))
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

  const duration = formatBlockDuration(dragPreviewEnd.value - dragPreviewStart.value)
  const range = `${hoursToTimeString(dragPreviewStart.value)}-${hoursToTimeString(dragPreviewEnd.value)}`
  return `${duration} (${range})`
}
</script>

<template>
  <section class="day-row" :class="{ 'is-today': isToday }" :style="{ animationDelay: rowIndex * 55 + 'ms' }">
    <div class="day-info">
      <div class="day-weekday-row">
        <span class="day-weekday">{{ weekdayAbbrev }}</span>
        <span v-if="isToday" class="today-dot"></span>
      </div>
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

    <div class="day-timeline">
      <div class="hour-labels">
        <span
          v-for="h in labeledHours"
          :key="h"
          class="hour-label"
          :style="{ left: hourLabelLeft(h) }"
        >{{ h }}:00</span>
      </div>

      <div v-if="allDayEntries.length > 0" class="all-day-list">
        <div
          v-for="(entry, entryIndex) in allDayEntries"
          :key="'allday-' + entry.id"
          class="all-day-banner"
          :style="[bannerStyle(entry), { animationDelay: blockDelay(entry, entryIndex) }]"
          @click="emit('edit', entry)"
        >
          <div class="block-content">
            <span class="block-left">
              <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="13" class="inline-icon" />
              {{ entryLeftLabel(entry) }}
            </span>
            <span class="block-right">{{ entryRightLabel(entry) }}</span>
          </div>
        </div>
      </div>

      <div class="hour-track" ref="trackEl" @mousedown="handleTrackMouseDown">
        <div class="track-grid">
          <span v-for="h in visibleHours" :key="h" class="grid-line"></span>
        </div>
        <div class="blocks">
          <div
            v-for="(entry, entryIndex) in visibleTimedEntries"
            :key="entry.id"
            class="block"
            :style="[blockStyle(entry), { animationDelay: blockDelay(entry, entryIndex) }]"
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
        <div v-if="nowLinePosition" class="now-line" :style="{ left: nowLinePosition }"></div>
      </div>
    </div>

    <div class="day-stats">
      <div class="stat-block">
        <div class="stat-total">
          <span class="total-value" :class="showGoalDiff && dailyStatus ? 'status-' + dailyStatus : ''">{{ formatHours(dayTotalHours) }}</span>
          <span v-if="showGoalDiff" class="total-value-target">/ {{ formatHours(dailyTargetHours) }}</span>
        </div>
        <div v-if="showGoalDiff && dailyStatus" class="goal-diff" :class="'status-' + dailyStatus">
          {{ formatDiff(dailyDiffHours) }}
        </div>
      </div>
      <div class="day-actions">
        <button
          type="button"
          class="icon-action clear"
          :disabled="entries.length === 0"
          title="Clear day"
          aria-label="Clear day"
          @click="handleClearDayClick"
        >
          <Eraser :size="13" />
        </button>
        <button type="button" class="icon-action add" title="Add entry" aria-label="Add entry" @click="emit('add', date)">
          <Plus :size="13" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.day-row {
  position: relative;
  display: grid;
  grid-template-columns: 104px 1fr 184px;
  gap: 26px;
  align-items: center;
  padding: 20px 4px;
  border-bottom: 1px solid var(--line);
  animation: fadeUp 0.4s var(--ease) both;
  transition: background-color 0.16s;
}

.day-row:last-child {
  border-bottom: none;
}

.day-row:hover {
  background: var(--accent-tint);
}

.day-row.is-today {
  background: var(--accent-tint);
}

.day-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-left: 10px;
}

.day-weekday-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.day-weekday {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--fg);
}

.day-row.is-today .day-weekday {
  color: var(--accent);
}

.today-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.day-date {
  font-size: 11px;
  color: var(--mute);
}

.break-warning-wrap {
  position: relative;
  display: inline-flex;
}

.break-warning {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--warn);
  background: transparent;
  border: 1px solid var(--warn);
  border-radius: var(--r);
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
  background: var(--surface);
  border: 1px solid var(--warn);
  border-radius: var(--r2);
  padding: 0.5rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--dim);
  text-align: left;
  white-space: normal;
  cursor: default;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.hidden-warning {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--mute);
  background: transparent;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  font-family: inherit;
}

.hidden-popup {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.4rem;
  border-color: var(--line-2);
}

.hidden-entry-item {
  text-align: left;
  background: var(--surface2);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 0.3rem 0.5rem;
  color: var(--dim);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
}

.hidden-entry-item:hover {
  border-color: var(--accent);
}

.day-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-right: 10px;
}

.icon-action {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--mute);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s,
    background-color 0.16s;
}

.icon-action.add {
  border-color: var(--accent);
  color: var(--accent);
}

.icon-action.add:hover {
  background: var(--accent-tint);
}

.icon-action.clear:hover {
  color: var(--bad);
  border-color: var(--bad);
}

.icon-action:disabled {
  opacity: 0.4;
  cursor: default;
}

.day-timeline {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hour-labels {
  position: relative;
  height: 11px;
}

.hour-label {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  white-space: nowrap;
}

.all-day-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 7px;
}

.all-day-banner {
  border-radius: var(--r2);
  border: none;
  font-size: 0.75rem;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  transform-origin: left;
  animation: growX 0.5s var(--ease) both;
}

.hour-track {
  position: relative;
  height: 52px;
  margin-top: 7px;
  border: 1px solid var(--line);
  border-radius: var(--r2);
  cursor: crosshair;
  user-select: none;
  overflow: hidden;
  background: var(--track);
}

.track-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.grid-line {
  flex: 1;
  border-right: 1px solid var(--line);
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
  border-radius: var(--r2);
  font-size: 0.7rem;
  line-height: 1.35;
  padding: 0.3rem 0.35rem 0.3rem 0.65rem;
  overflow: hidden;
  cursor: grab;
  display: flex;
  align-items: center;
  container-type: inline-size;
  transform-origin: left;
  animation: growX 0.5s var(--ease) both;
  transition: filter 0.16s;
}

.block:hover {
  filter: brightness(1.18);
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
  background: color-mix(in srgb, var(--fg) 35%, transparent);
}

.resize-handle.left {
  left: 0;
  border-radius: var(--r2) 0 0 var(--r2);
}

.resize-handle.right {
  right: 0;
  border-radius: 0 var(--r2) var(--r2) 0;
}

.drag-ghost {
  position: absolute;
  top: 5px;
  bottom: 5px;
  border: 2px dashed var(--fg);
  border-radius: var(--r2);
  background: transparent;
  pointer-events: none;
}

.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
  transform: translateX(-50%);
  z-index: 5;
  pointer-events: none;
  animation: pulseLine 2.4s ease-in-out infinite;
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
  font-weight: 500;
}

.block-time {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.75;
  font-family: var(--font-mono);
  font-size: 0.85em;
}

/* "2 chars or less before it'd need an ellipsis" is a rough width, not a
   literal character count - measured off the block's own rendered width via
   a container query so it stays correct across every zoom level/window size. */
@container (max-width: 28px) {
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
  font-family: var(--font-mono);
}

.day-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  white-space: nowrap;
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.stat-total {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 4px;
}

.total-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--fg);
}

.total-value.status-green {
  color: var(--ok);
}

.total-value.status-yellow {
  color: var(--warn);
}

.total-value.status-red {
  color: var(--bad);
}

.total-value-target {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
}

.goal-diff {
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.goal-diff.status-green {
  color: var(--ok);
}

.goal-diff.status-yellow {
  color: var(--warn);
}

.goal-diff.status-red {
  color: var(--bad);
}
</style>
