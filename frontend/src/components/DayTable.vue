<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { TriangleAlert, StickyNote, Briefcase, House, Eraser, Plus, Copy, ClipboardPaste, Check } from '@lucide/vue'
import { durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'
import { DAILY_RED_THRESHOLD_HOURS } from '@/utils/constants'
import { computeBreakWarning } from '@/utils/breakRules'
import { showToast } from '@/utils/toast'
import { useAppShell } from '@/composables/useAppShell'

const props = defineProps({
  date: { type: Date, required: true },
  rowIndex: { type: Number, default: 0 }, // position within the visible week - staggers this row's own enter and its blocks' reveal
  entries: { type: Array, default: () => [] },
  showGoalDiff: { type: Boolean, default: false },
  dailyTargetHours: { type: Number, required: true },
  viewFromHour: { type: Number, required: true },
  viewTillHour: { type: Number, required: true },
  entryTypeColors: { type: Object, required: true },
  hasCopiedDay: { type: Boolean, default: false },
  pasteSuccess: { type: Object, default: null }, // { date, id } - set by the parent right after a successful paste
  tasks: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'edit', 'clear-day', 'resize-entry', 'copy-day', 'paste-day'])

const { isNarrowViewport } = useAppShell()

// Briefly swaps the copy icon for a checkmark so the click has visible
// confirmation - the copy itself is synchronous/local, so there's nothing
// to await here, just a timed revert.
const justCopied = ref(false)
let copiedResetTimeoutId = null
onBeforeUnmount(() => clearTimeout(copiedResetTimeoutId))

function handleCopyClick() {
  emit('copy-day', props.date)
  justCopied.value = true
  clearTimeout(copiedResetTimeoutId)
  copiedResetTimeoutId = setTimeout(() => {
    justCopied.value = false
  }, 1500)
}

// Paste can fail (overwrite declined, store error) or need a confirmation
// dialog first, so unlike copy this can't just flash on click - the parent
// tells us via `pasteSuccess` once the paste has actually gone through.
const justPasted = ref(false)
let pastedResetTimeoutId = null
onBeforeUnmount(() => clearTimeout(pastedResetTimeoutId))

watch(
  () => props.pasteSuccess,
  (success) => {
    if (!success || toISODate(success.date) !== toISODate(props.date)) return
    justPasted.value = true
    clearTimeout(pastedResetTimeoutId)
    pastedResetTimeoutId = setTimeout(() => {
      justPasted.value = false
    }, 1500)
  },
)

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
const monthDayLabel = computed(() => props.date.toLocaleString('en-GB', { month: 'short', day: 'numeric' }))

// An all-day Vacation or Public Holiday entry credits the full daily
// target, same as the overall balance does - the day reads as "on target",
// not a shortfall.
const FULL_DAY_CREDIT_TYPES = ['Vacation', 'PublicHoliday']
const hasFullDayCredit = computed(() =>
  props.entries.some((e) => FULL_DAY_CREDIT_TYPES.includes(e.entryType) && e.allDay),
)

const dailyDiffHours = computed(() =>
  hasFullDayCredit.value ? 0 : dayTotalHours.value - props.dailyTargetHours,
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
const breakPopupStyle = ref({})
const hiddenPopupStyle = ref({})

// Both popups are teleported to <body> and positioned from their trigger
// button's own rect, same reasoning as the entry tooltip below - staying a
// normal descendant here would put them at the mercy of this row's own
// stacking context (its fadeUp animation makes every .day-row form one, so
// a later row always paints over an earlier row's in-flow popup regardless
// of z-index).
function popupStyleFor(rect) {
  return { left: `${rect.left}px`, top: `${rect.bottom + 6}px` }
}

function toggleBreakPopup(event) {
  if (!showBreakPopup.value) breakPopupStyle.value = popupStyleFor(event.currentTarget.getBoundingClientRect())
  showBreakPopup.value = !showBreakPopup.value
}

function toggleHiddenPopup(event) {
  if (!showHiddenPopup.value) hiddenPopupStyle.value = popupStyleFor(event.currentTarget.getBoundingClientRect())
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
  // Round to whole minutes first, then split - see formatHours in
  // utils/date.js for why rounding h and m independently can show "1h 60m".
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
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
const dragMoved = ref(false) // move/resize only: whether the pointer actually moved this gesture

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

// An All Day entry blocks (and is blocked by) everything else on its day -
// checked first, unconditionally, since it has no time range of its own to
// compare against `start`/`end`.
function hasOverlap(start, end, excludeId) {
  if (allDayEntries.value.some((e) => e.id !== excludeId)) return true
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

// Bridges the gap between letting go of a drag and the save round-trip
// landing back in `props.entries`: without this, clearing dragMode/dragEntry
// immediately on mouseup makes effectiveRange fall back to entryRange(entry)
// for one render - the pre-drag time, since the prop hasn't updated yet -
// producing a visible snap-back-then-forward flicker. Keeping the dragged
// value here until the prop actually catches up (or a timeout gives up, in
// case the save fails) papers over that gap.
const pendingOverrides = reactive({})
const pendingOverrideTimeouts = {}

function setPendingOverride(id, start, end) {
  pendingOverrides[id] = { start, end }
  clearTimeout(pendingOverrideTimeouts[id])
  pendingOverrideTimeouts[id] = setTimeout(() => clearPendingOverride(id), 5000)
}

function clearPendingOverride(id) {
  delete pendingOverrides[id]
  clearTimeout(pendingOverrideTimeouts[id])
  delete pendingOverrideTimeouts[id]
}

watch(
  () => props.entries,
  () => {
    for (const id of Object.keys(pendingOverrides)) {
      const entry = props.entries.find((e) => String(e.id) === id)
      if (!entry) {
        clearPendingOverride(id)
        continue
      }
      const r = entryRange(entry)
      const o = pendingOverrides[id]
      if (Math.abs(r.start - o.start) < 1e-6 && Math.abs(r.end - o.end) < 1e-6) clearPendingOverride(id)
    }
  },
  { deep: true },
)

onBeforeUnmount(() => Object.keys(pendingOverrideTimeouts).forEach(clearPendingOverride))

function effectiveRange(entry) {
  if (dragEntry.value?.id === entry.id && dragMode.value && dragMode.value !== 'create') {
    return { start: dragPreviewStart.value, end: dragPreviewEnd.value }
  }
  if (pendingOverrides[entry.id]) return pendingOverrides[entry.id]
  return entryRange(entry)
}

function startDragListeners() {
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
  document.addEventListener('keydown', handleDragKeydown)
}

function stopDragListeners() {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
  document.removeEventListener('keydown', handleDragKeydown)
}

// Escape while still sketching a new entry (mouse still held down) backs
// out without opening the add-entry modal - only applies to a fresh
// create-drag, not an in-progress resize/move of an existing entry.
function handleDragKeydown(event) {
  if (event.key !== 'Escape' || dragMode.value !== 'create') return
  event.preventDefault()
  stopDragListeners()
  dragMode.value = null
  dragEntry.value = null
}

onBeforeUnmount(stopDragListeners)

function handleTrackMouseDown(event) {
  if (allDayEntries.value.length > 0) return // the whole day is already spoken for
  event.preventDefault() // stops the browser's native text-selection drag from kicking in
  const start = snapHours(hoursFromClientX(event.clientX), event.ctrlKey)
  dragMode.value = 'create'
  dragEntry.value = null
  dragAnchorHours.value = start
  dragPreviewStart.value = start
  dragPreviewEnd.value = start
  hoverHours.value = null
  startDragListeners()
}

// A live "what time is under my cursor" line for empty track space - same
// snapping (1min, or 5min with Ctrl held) as the drag-to-create handlers
// above, so the line always previews exactly where a click-drag would
// start. Hidden once a drag is underway (the ghost/preview takes over) and
// over any already-occupied time (nothing to create there).
const hoverHours = ref(null)

function isHourOccupied(hours) {
  return timedEntries.value.some((e) => {
    const { start, end } = entryRange(e)
    return hours >= start && hours < end
  })
}

function handleTrackMouseMove(event) {
  if (dragMode.value || allDayEntries.value.length > 0) {
    hoverHours.value = null
    return
  }
  const snapped = snapHours(hoursFromClientX(event.clientX), event.ctrlKey)
  hoverHours.value = isHourOccupied(snapped) ? null : snapped
}

function handleTrackMouseLeave() {
  hoverHours.value = null
}

const hoverLinePosition = computed(() => {
  if (hoverHours.value === null) return null
  return `${((hoverHours.value - props.viewFromHour) / rangeSpan.value) * 100}%`
})

const hoverTimeLabel = computed(() => (hoverHours.value === null ? '' : hoursToTimeString(hoverHours.value)))

function handleBlockMouseDown(event, entry) {
  event.preventDefault()
  const { start, end } = entryRange(entry)
  dragMode.value = 'move'
  dragEntry.value = entry
  dragGrabOffsetHours.value = hoursFromClientX(event.clientX) - start
  dragPreviewStart.value = start
  dragPreviewEnd.value = end
  dragMoved.value = false
  hoveredEntry.value = null
  startDragListeners()
}

function handleEdgeMouseDown(event, entry, edge) {
  event.preventDefault()
  const { start, end } = entryRange(entry)
  dragMode.value = edge === 'start' ? 'resize-start' : 'resize-end'
  dragEntry.value = entry
  dragPreviewStart.value = start
  dragPreviewEnd.value = end
  dragMoved.value = false
  hoveredEntry.value = null
  startDragListeners()
}

function handleDragMove(event) {
  const raw = hoursFromClientX(event.clientX)
  const snapped = snapHours(raw, event.ctrlKey)
  dragMoved.value = true

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

  if (!dragMoved.value) {
    emit('edit', entry) // the pointer never moved - treat it as a click, not a drag
    return
  }
  // The pointer did move, but a coarse Ctrl-grid snap can still land back on
  // the entry's original range - that's a real drag gesture, just not one
  // worth saving, so it's neither a click (don't open the edit modal) nor a
  // change (don't fire a no-op save).
  const original = entryRange(entry)
  const changed = Math.abs(start - original.start) > 1e-6 || Math.abs(end - original.end) > 1e-6
  if (!changed) return
  if (hasOverlap(start, end, entry.id)) {
    showToast('This time range overlaps with an existing entry.')
    return
  }
  setPendingOverride(entry.id, start, end)
  emit('resize-entry', entry.id, hoursToTimeString(start), hoursToTimeString(end))
}

function handleClearDayClick() {
  if (props.entries.length === 0) return
  emit('clear-day', props.date)
}

// A linked task's color (if it has one) rides on top of the entry's normal
// type-color background as a diagonal stripe pattern - semi-transparent so
// the underlying entry-type color still reads through. Only Working entries
// can be linked to a task, and Working entries are never all-day, so this
// only ever needs to apply here, not in allDayBlockStyle below.
function taskStripeImage(entry) {
  const color = taskById.value[entry.taskItemId]?.color
  if (!color) return null
  // 6-digit hex + a 2-digit alpha suffix is a valid 8-digit CSS hex color -
  // cheaper than a hex->rgba conversion for what's just an overlay tint.
  return `repeating-linear-gradient(45deg, ${color}99 0px, ${color}99 6px, transparent 6px, transparent 12px)`
}

// A faux-stroke halo around the label text, in the opposite tone from the
// text color itself - only needed once the diagonal stripe overlay is in
// play, since that's what can clash with style.text (chosen to contrast
// with the flat entry-type color, not with an arbitrary stripe color on
// top of it). text-shadow is inherited, so setting it on the block covers
// block-title/block-time/note-icon text below without repeating it per element.
function textHaloFor(textColor) {
  const halo = textColor === '#ffffff' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)'
  return [-1, 1].flatMap((x) => [-1, 1].map((y) => `${x}px ${y}px 2px ${halo}`)).join(', ')
}

function blockStyle(entry) {
  const { start, end } = effectiveRange(entry)
  const clippedStart = Math.max(start, props.viewFromHour)
  const clippedEnd = Math.min(end, props.viewTillHour)
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  const stripeImage = taskStripeImage(entry)
  return {
    left: `${((clippedStart - props.viewFromHour) / rangeSpan.value) * 100}%`,
    width: `${((clippedEnd - clippedStart) / rangeSpan.value) * 100}%`,
    backgroundColor: style.bg,
    backgroundImage: stripeImage || 'none',
    color: style.text,
    textShadow: stripeImage ? textHaloFor(style.text) : 'none',
  }
}

// Live "start - end" readout for the in-progress create-drag ghost -
// updates every mousemove same as the ghost's own position/width, since
// both read off the same dragPreviewStart/End refs.
const dragRangeLabel = computed(() =>
  dragMode.value === 'create' ? `${hoursToTimeString(dragPreviewStart.value)} - ${hoursToTimeString(dragPreviewEnd.value)}` : '',
)

function ghostStyle() {
  const clippedStart = Math.max(dragPreviewStart.value, props.viewFromHour)
  const clippedEnd = Math.min(dragPreviewEnd.value, props.viewTillHour)
  return {
    left: `${((clippedStart - props.viewFromHour) / rangeSpan.value) * 100}%`,
    width: `${((clippedEnd - clippedStart) / rangeSpan.value) * 100}%`,
  }
}

// All Day entries sit on the actual timeline grid, filled across the whole
// visible range (left/width are always 0%/100% - there's no start/end time
// to clip against, unlike blockStyle above).
function allDayBlockStyle(entry) {
  const style = colorStyleForType(entry.entryType, props.entryTypeColors)
  return {
    left: '0%',
    width: '100%',
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

const taskById = computed(() => Object.fromEntries(props.tasks.map((t) => [t.id, t])))

// A linked task's name outranks both Title and Entry Type - once an entry
// is tied to a task, that's the more useful label everywhere this entry
// shows up.
function entryDisplayLabel(entry) {
  return taskById.value[entry.taskItemId]?.name ?? entry.title ?? entry.entryType
}

// Left side: label (see entryDisplayLabel) - Notes. Notes are omitted
// entirely when there's none.
function entryLeftLabel(entry) {
  const label = entryDisplayLabel(entry)
  return entry.notes ? `${label} - ${entry.notes}` : label
}

// Row 1 of a timeline block - same as entryLeftLabel but without the notes
// text, since notes get their own icon instead (there's rarely room for
// both on a block this narrow).
function blockTitleLabel(entry) {
  return entryDisplayLabel(entry)
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

// Mobile-only single-line block label: "Entry Type (worked)" instead of the
// two-line title/time-range split desktop uses - same drag-preview-aware
// duration as blockTimeLabel, just without the start-end range alongside it.
function blockMobileLabel(entry) {
  if (entry.allDay) return `${blockTitleLabel(entry)} (All Day)`
  const isDraggingThis =
    dragEntry.value?.id === entry.id &&
    (dragMode.value === 'move' || dragMode.value === 'resize-start' || dragMode.value === 'resize-end')
  const hours = isDraggingThis
    ? dragPreviewEnd.value - dragPreviewStart.value
    : durationHours(entry.startTime, entry.endTime)
  return `${blockTitleLabel(entry)} (${formatBlockDuration(hours)})`
}

// "OvertimeCompensation" -> "Overtime Compensation" - display only, doesn't
// touch the stored enum value.
function formatEntryTypeLabel(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

// Rich hover tooltip (replaces the plain native `title` attribute) showing
// every field an entry has, not just title/time. Teleported to <body> and
// positioned from the hovered block's own rect, same reasoning as the
// calendar/modal fixes elsewhere in this app - staying a normal descendant
// here would put it at the mercy of the track's overflow:hidden and this
// row's own stacking context.
const hoveredEntry = ref(null)
const tooltipStyle = ref({})

function showEntryTooltip(event, entry) {
  if (dragMode.value) return // a drag is already showing its own live label
  hoveredEntry.value = entry
  const rect = event.currentTarget.getBoundingClientRect()
  const left = Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130)
  const spaceBelow = window.innerHeight - rect.bottom
  tooltipStyle.value =
    spaceBelow < 180
      ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + 8}px` }
      : { left: `${left}px`, top: `${rect.bottom + 8}px` }
}

function hideEntryTooltip() {
  hoveredEntry.value = null
}

const hoveredTask = computed(() => taskById.value[hoveredEntry.value?.taskItemId] ?? null)

const tooltipTimeText = computed(() => {
  const entry = hoveredEntry.value
  if (!entry) return ''
  if (entry.allDay) return 'All day'
  return `${entry.startTime?.slice(0, 5)} – ${entry.endTime?.slice(0, 5)} (${formatHours(durationHours(entry.startTime, entry.endTime))})`
})
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
        <button type="button" class="break-warning" :title="breakWarningTitle" @click.stop="toggleBreakPopup($event)">
          <TriangleAlert :size="12" />
        </button>
      </span>
      <span v-if="hiddenTimedEntries.length > 0" class="break-warning-wrap">
        <button type="button" class="hidden-warning" @click.stop="toggleHiddenPopup($event)">
          {{ hiddenTimedEntries.length }} hidden
        </button>
      </span>

      <Teleport to="body">
        <div v-if="showBreakPopup" class="break-popup" :style="breakPopupStyle" @click.stop>{{ breakWarningTitle }}</div>
      </Teleport>
      <Teleport to="body">
        <div v-if="showHiddenPopup" class="break-popup hidden-popup" :style="hiddenPopupStyle" @click.stop>
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
      </Teleport>
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

      <div
        class="hour-track"
        :class="{ blocked: allDayEntries.length > 0 }"
        ref="trackEl"
        @mousedown="handleTrackMouseDown"
        @mousemove="handleTrackMouseMove"
        @mouseleave="handleTrackMouseLeave"
      >
        <div class="track-grid">
          <span v-for="h in visibleHours" :key="h" class="grid-line"></span>
        </div>
        <div class="blocks">
          <div
            v-for="(entry, entryIndex) in allDayEntries"
            :key="'allday-' + entry.id"
            class="block all-day-block"
            :style="[allDayBlockStyle(entry), { animationDelay: blockDelay(entry, entryIndex) }]"
            @click="emit('edit', entry)"
            @mouseenter="showEntryTooltip($event, entry)"
            @mouseleave="hideEntryTooltip"
          >
            <div class="block-content">
              <template v-if="!isNarrowViewport">
                <span class="block-title">
                  <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="11" class="inline-icon" />
                  {{ blockTitleLabel(entry) }}
                </span>
                <span class="block-time">{{ blockTimeLabel(entry) }}</span>
              </template>
              <span v-else class="block-title">
                {{ blockMobileLabel(entry) }}
              </span>
            </div>
            <StickyNote v-if="entry.notes" class="note-icon" :size="10" :title="entry.notes" />
          </div>
          <div
            v-for="(entry, entryIndex) in visibleTimedEntries"
            :key="entry.id"
            class="block"
            :style="[blockStyle(entry), { animationDelay: blockDelay(entry, entryIndex) }]"
            @mousedown.stop="handleBlockMouseDown($event, entry)"
            @mouseenter="showEntryTooltip($event, entry)"
            @mouseleave="hideEntryTooltip"
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
              <template v-if="!isNarrowViewport">
                <span class="block-title">
                  <component :is="locationIcon(entry)" v-if="locationIcon(entry)" :size="11" class="inline-icon" />
                  {{ blockTitleLabel(entry) }}
                </span>
                <span class="block-time">{{ blockTimeLabel(entry) }}</span>
              </template>
              <span v-else class="block-title">
                {{ blockMobileLabel(entry) }}
              </span>
            </div>
            <StickyNote v-if="entry.notes" class="note-icon" :size="10" :title="entry.notes" />
          </div>
          <div v-if="dragMode === 'create'" class="drag-ghost" :style="ghostStyle()">
            <span class="drag-ghost-label">{{ dragRangeLabel }}</span>
          </div>
        </div>
        <div v-if="nowLinePosition" class="now-line" :style="{ left: nowLinePosition }"></div>
        <div v-if="hoverLinePosition" class="hover-line" :style="{ left: hoverLinePosition }">
          <span class="hover-time-label">{{ hoverTimeLabel }}</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="hoveredEntry"
        class="entry-tooltip"
        :style="[tooltipStyle, { borderLeftColor: colorStyleForType(hoveredEntry.entryType, entryTypeColors).border }]"
      >
        <div class="tooltip-title">
          <component :is="locationIcon(hoveredEntry)" v-if="locationIcon(hoveredEntry)" :size="12" class="inline-icon" />
          {{ hoveredTask?.name ?? hoveredEntry.title ?? formatEntryTypeLabel(hoveredEntry.entryType) }}
        </div>
        <div v-if="hoveredTask && hoveredEntry.title" class="tooltip-row">
          <span class="tooltip-label">Title</span><span>{{ hoveredEntry.title }}</span>
        </div>
        <div v-if="hoveredTask || hoveredEntry.title" class="tooltip-row">
          <span class="tooltip-label">Type</span><span>{{ formatEntryTypeLabel(hoveredEntry.entryType) }}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Time</span><span>{{ tooltipTimeText }}</span>
        </div>
        <div v-if="hoveredEntry.workLocation" class="tooltip-row">
          <span class="tooltip-label">Location</span><span>{{ hoveredEntry.workLocation }}</span>
        </div>
        <div v-if="hoveredEntry.notes" class="tooltip-row notes">
          <span class="tooltip-label">Notes</span><span>{{ hoveredEntry.notes }}</span>
        </div>
      </div>
    </Teleport>

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
          <span v-if="isNarrowViewport" class="action-label">Clear</span>
        </button>
        <button
          type="button"
          class="icon-action add"
          :disabled="allDayEntries.length > 0"
          :title="allDayEntries.length > 0 ? 'This day is already fully booked by an All Day entry' : 'Add entry'"
          aria-label="Add entry"
          @click="emit('add', date)"
        >
          <Plus :size="13" />
          <span v-if="isNarrowViewport" class="action-label">Add</span>
        </button>
        <button
          type="button"
          class="icon-action copy"
          :class="{ confirmed: justCopied }"
          :disabled="entries.length === 0"
          title="Copy day"
          aria-label="Copy day"
          @click="handleCopyClick"
        >
          <Check v-if="justCopied" :size="13" />
          <Copy v-else :size="13" />
          <span v-if="isNarrowViewport" class="action-label">{{ justCopied ? 'Copied' : 'Copy' }}</span>
        </button>
        <button
          type="button"
          class="icon-action paste"
          :class="{ confirmed: justPasted }"
          :disabled="!hasCopiedDay"
          title="Paste day"
          aria-label="Paste day"
          @click="emit('paste-day', date)"
        >
          <Check v-if="justPasted" :size="13" />
          <ClipboardPaste v-else :size="13" />
          <span v-if="isNarrowViewport" class="action-label">{{ justPasted ? 'Pasted' : 'Paste' }}</span>
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
  position: fixed;
  z-index: 300;
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

.entry-tooltip {
  position: fixed;
  transform: translateX(-50%);
  z-index: 300;
  width: max-content;
  max-width: 15rem;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--line-2);
  border-radius: var(--r2);
  padding: 0.55rem 0.7rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.tooltip-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 0.3rem;
}

.tooltip-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--dim);
  padding: 0.1rem 0;
}

.tooltip-row.notes {
  white-space: normal;
  word-break: break-word;
}

.tooltip-label {
  flex: none;
  min-width: 3.6rem;
  color: var(--mute);
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
  display: grid;
  grid-template-columns: repeat(2, 26px);
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

.icon-action.copy:hover,
.icon-action.paste:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-tint);
}

.icon-action.confirmed,
.icon-action.confirmed:hover {
  color: var(--ok);
  border-color: var(--ok);
  background: transparent;
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

.hour-track.blocked {
  cursor: default;
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

.all-day-block {
  cursor: pointer;
}

.all-day-block:active {
  cursor: pointer;
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

.drag-ghost-label {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 1px 4px;
  white-space: nowrap;
}

.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--fg);
  transform: translateX(-50%);
  z-index: 5;
  pointer-events: none;
  animation: pulseLine 2.4s ease-in-out infinite;
}

.now-line::before {
  /* top: 0 (flush with the track's top edge) rather than straddling it
     with a negative offset - the track has overflow:hidden, so anything
     positioned above y:0 gets clipped clean off instead of just poking out. */
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fg);
  transform: translateX(-50%);
}

.hover-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line-2);
  transform: translateX(-50%);
  z-index: 4;
  pointer-events: none;
}

.hover-time-label {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--dim);
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 1px 4px;
  white-space: nowrap;
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

/* Phone-landscape tier: three stacked rows instead of three side-by-side
   columns - top row has the day's identity and its numbers together
   (weekday/date on the left, hours/goal/diff on the right), the middle row
   is the timeline at full width, and the action buttons get their own row
   along the bottom.
   .day-stats keeps its two children (.stat-block, .day-actions) in the DOM
   exactly as desktop has them - `display: contents` here just un-wraps that
   box so the two children become direct grid items of .day-row, placeable
   into their own areas, without touching the desktop-only flex styling
   still defined on .day-stats above. */
@media (max-width: 900px) {
  .day-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'info stats'
      'timeline timeline'
      'actions actions';
    row-gap: 10px;
    column-gap: 14px;
    padding: 16px 4px;
  }

  .day-info {
    grid-area: info;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    margin-left: 2px;
  }

  .day-weekday-row {
    gap: 4px;
  }

  .day-stats {
    display: contents;
  }

  .stat-block {
    grid-area: stats;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    margin-right: 2px;
  }

  .day-timeline {
    grid-area: timeline;
  }

  .day-actions {
    grid-area: actions;
    display: flex;
    flex-direction: row;
    gap: 8px;
    margin-right: 2px;
  }

  /* Equal-width, stretched across the full row instead of squared off in
     the corner - labeled so a wide button doesn't just read as empty space
     around a small icon. */
  .icon-action {
    flex: 1;
    width: auto;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .action-label {
    font-size: 11.5px;
    font-weight: 600;
  }

  .hour-track {
    height: 48px;
  }

  .day-weekday {
    font-size: 14px;
  }

  .day-date {
    font-size: 11.5px;
  }

  .total-value {
    font-size: 16px;
  }
}
</style>
