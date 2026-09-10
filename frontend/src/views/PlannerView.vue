<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { X, Info } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAppShell } from '@/composables/useAppShell'
import { getMonday, addDays, addWeeks, toISODate, durationHours, isWeekend, timeToDecimalHours } from '@/utils/date'
import { ENTRY_TYPES, colorStyleForType } from '@/utils/entryTypeColors'
import { taskUpdatePayload, enrichTaskForDetail } from '@/utils/taskStats'
import { showToast } from '@/utils/toast'
import DayTable from '@/components/DayTable.vue'
import WeekSummary from '@/components/WeekSummary.vue'
import EntryFormModal from '@/components/EntryFormModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import UnlinkOrDeleteTaskDialog from '@/components/UnlinkOrDeleteTaskDialog.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'

// Fields that make up an entry's "content" (everything except its id) -
// what gets snapshotted for an undo and what a create/update payload needs.
function entryPayload(entry) {
  const { id, ...rest } = entry
  return rest
}

// "OvertimeCompensation" -> "Overtime Compensation" - purely a display
// label for the legend, doesn't touch the stored enum value anywhere.
function formatEntryTypeLabel(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const store = useScheduleStore()
const tasksStore = useTasksStore()
const { isNarrowViewport } = useAppShell()

// Visual cue for Ctrl (15min snap) / Shift (linked-edge resize) / Alt
// (split a body click, merge an edge right-click) while interacting with
// the timeline below - tracked globally via keydown/keyup rather than read
// off drag events, so it's visible the instant a key goes down even before
// the pointer moves again. `blur` clears all three: alt-tabbing away (or
// anything else that steals focus) mid-hold never fires a keyup, which
// would otherwise leave a stuck "held" indicator.
const ctrlHeld = ref(false)
const shiftHeld = ref(false)
const altHeld = ref(false)
function handleModifierKeydown(event) {
  if (event.key === 'Control') ctrlHeld.value = true
  if (event.key === 'Shift') shiftHeld.value = true
  if (event.key === 'Alt') altHeld.value = true
}
function handleModifierKeyup(event) {
  if (event.key === 'Control') ctrlHeld.value = false
  if (event.key === 'Shift') shiftHeld.value = false
  if (event.key === 'Alt') altHeld.value = false
}
function clearHeldModifiers() {
  ctrlHeld.value = false
  shiftHeld.value = false
  altHeld.value = false
}
onMounted(() => {
  window.addEventListener('keydown', handleModifierKeydown)
  window.addEventListener('keyup', handleModifierKeyup)
  window.addEventListener('blur', clearHeldModifiers)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleModifierKeydown)
  window.removeEventListener('keyup', handleModifierKeyup)
  window.removeEventListener('blur', clearHeldModifiers)
})

// "Sat", "Sun", or "Sat & Sun" - whichever weekend days are currently
// hidden. Empty when neither is, so the info-hint line can drop the clause
// entirely instead of pointing at a setting that isn't even in effect.
const hiddenWeekendLabel = computed(() => {
  const hidden = []
  if (!store.visibleWeekdays.includes(6)) hidden.push('Sat')
  if (!store.visibleWeekdays.includes(0)) hidden.push('Sun')
  return hidden.join(' & ')
})

const route = useRoute()
const router = useRouter()
// A ?week=YYYY-MM-DD query param (e.g. from the task detail modal's "jump
// to schedule" button) opens straight into that week instead of the
// current one - read once at mount, not kept in sync afterward, since
// navigating here is always a fresh route entry (see App.vue's routing).
const initialWeekParam = typeof route.query.week === 'string' ? route.query.week : null
const currentMonday = ref(initialWeekParam ? getMonday(new Date(`${initialWeekParam}T00:00:00`)) : getMonday(new Date()))
// All 7 days of the current week, Mon-Sun - calculations (totals, balance)
// always use this full set regardless of which days are visible.
const allWeekDates = computed(() => Array.from({ length: 7 }, (_, i) => addDays(currentMonday.value, i)))
// The subset the user has chosen to actually show cards for.
const visibleWeekDates = computed(() =>
  allWeekDates.value.filter((date) => store.visibleWeekdays.includes(date.getDay())),
)

const showModal = ref(false)
const editingEntry = ref(null)
const modalDefaultDate = ref(new Date())

// Right-click "Go to Task" on an entry - opens the same expanded task view
// the Tasks board uses, stat-enriched via enrichTaskForDetail since this
// isn't one of that board's own already-enriched cards.
const viewTaskId = ref(null)
const viewTask = computed(() => {
  const task = tasksStore.tasks.find((t) => t.id === viewTaskId.value)
  return task ? enrichTaskForDetail(task, tasksStore.tasks, store.entries) : null
})
function handleViewTask(taskId) {
  viewTaskId.value = taskId
}
function closeViewTask() {
  viewTaskId.value = null
}
// Full edit/delete for a task lives on the Tasks board - hand off there
// rather than duplicating that flow (undo toast, Group cascade dialog) here.
function goToTasksBoard() {
  viewTaskId.value = null
  router.push({ name: 'tasks' })
}
const modalPrefillTimes = ref(null) // { startTime, endTime } from a timeline drag-to-create
const modalError = ref(null)
const saving = ref(false)

const entryTypeLegend = computed(() =>
  ENTRY_TYPES.map((type) => ({
    type,
    label: formatEntryTypeLabel(type),
    ...colorStyleForType(type, store.entryTypeColors),
  })),
)

async function handleApplyHolidayAdjustment(deltaDays) {
  try {
    await store.applyHolidayAdjustment(deltaDays)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

function entriesForDate(date) {
  const iso = toISODate(date)
  return store.entries.filter((e) => e.date === iso)
}

// Same overlap rule DayTable's own drag-create uses, just checking against
// an arbitrary target day instead of the day the drag started on - an
// All Day entry (existing or incoming) claims the whole day, otherwise it's
// a plain time-range intersection.
function entryOverlapsDate(entry, date) {
  const existing = entriesForDate(date)
  if (entry.allDay) return existing.length > 0
  if (existing.some((e) => e.allDay)) return true
  const start = timeToDecimalHours(entry.startTime)
  const end = timeToDecimalHours(entry.endTime)
  return existing.some((e) => {
    if (e.allDay) return true
    return start < timeToDecimalHours(e.endTime) && end > timeToDecimalHours(e.startTime)
  })
}

// Same "does this calendar week have any entry at all" check the running
// balance uses to decide whether a week counts - the daily-goal diff only
// shows up on business days once the week it belongs to isn't empty.
const weekHasAnyEntries = computed(() =>
  store.entries.some((e) => toISODate(getMonday(new Date(e.date + 'T00:00:00'))) === toISODate(currentMonday.value)),
)

function hasWorkingEntry(date) {
  return entriesForDate(date).some((e) => e.entryType === 'Working' && !e.allDay)
}

// Weekends only show a goal-diff once they actually have a Working entry -
// otherwise every empty Saturday would flag as "behind target", which
// doesn't make sense since weekends aren't expected work days by default.
function showGoalDiffFor(date) {
  return isWeekend(date) ? hasWorkingEntry(date) : weekHasAnyEntries.value
}

const weeklyTotalHours = computed(() =>
  allWeekDates.value.reduce((sum, date) => {
    const dayHours = entriesForDate(date)
      .filter((e) => e.entryType === 'Working' && !e.allDay)
      .reduce((s, e) => s + durationHours(e.startTime, e.endTime), 0)
    return sum + dayHours
  }, 0),
)

function goPrevWeek() {
  currentMonday.value = addWeeks(currentMonday.value, -1)
}

function goNextWeek() {
  currentMonday.value = addWeeks(currentMonday.value, 1)
}

function goToday() {
  currentMonday.value = getMonday(new Date())
}

function goToDate(date) {
  currentMonday.value = getMonday(date)
}

async function handleApplyAdjustment(deltaMinutes) {
  try {
    await store.applyAdjustment(deltaMinutes)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

function openAdd(date, prefill = null) {
  editingEntry.value = null
  modalDefaultDate.value = date
  modalPrefillTimes.value = prefill
  modalError.value = null
  showModal.value = true
}

function viewNextAppointment(entry) {
  goToDate(new Date(entry.date + 'T00:00:00'))
}

function openEdit(entry) {
  editingEntry.value = entry
  modalError.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingEntry.value = null
  modalPrefillTimes.value = null
  modalError.value = null
}

async function handleClearDay(date) {
  const iso = toISODate(date)
  const snapshot = entriesForDate(date).map(entryPayload)
  if (snapshot.length === 0) return
  try {
    await store.clearDay(iso)
    showToast(`Cleared ${snapshot.length} entr${snapshot.length === 1 ? 'y' : 'ies'}.`, {
      variant: 'error',
      duration: 6000,
      actionLabel: 'Undo',
      onAction: () => restoreEntries(snapshot),
    })
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

// Recreates a batch of entry snapshots (from a clear-day undo or a paste),
// one at a time - concurrent inserts would race each other's overlap/All-Day
// checks against a target day that's still empty from each other's
// perspective.
async function restoreEntries(entries) {
  try {
    for (const entry of entries) {
      await store.createEntry(entry)
    }
  } catch {
    showToast("Couldn't restore everything - some entries may be missing.")
  }
}

// Holds the source day's entries with id/date stripped, ready to be
// recreated on whatever day gets pasted onto next. A plain ref (not store
// state) since it's a transient clipboard, not schedule data - it doesn't
// need to survive a reload, just week navigation, which this view already
// does without unmounting.
const copiedDayEntries = ref(null)

function handleCopyDay(date) {
  const entries = entriesForDate(date)
  if (entries.length === 0) return
  copiedDayEntries.value = entries.map((entry) => {
    const { date: _date, ...rest } = entryPayload(entry)
    return rest
  })
}

// The day pending an overwrite confirmation when pasting onto a non-empty
// day - null while the ConfirmDialog is closed.
const pastePendingOverwriteDate = ref(null)

async function pasteCopiedEntriesOnto(date) {
  const targetIso = toISODate(date)
  for (const entry of copiedDayEntries.value) {
    await store.createEntry({ ...entry, date: targetIso })
  }
}

// Tells the DayTable row for `date` to flash its paste-confirmed checkmark.
// A fresh object each time (rather than just the date) so pasting onto the
// same day twice in a row still registers as a change for the row's watcher.
const pasteSuccess = ref(null)
let pasteSuccessCounter = 0
function markPasteSuccess(date) {
  pasteSuccessCounter += 1
  pasteSuccess.value = { date, id: pasteSuccessCounter }
}

// Right-click "Copy" on a single entry - shares the same clipboard as
// Copy Day, just holding one entry instead of the whole day's worth.
function handleCopyEntry(entry) {
  const { date: _date, ...rest } = entryPayload(entry)
  copiedDayEntries.value = [rest]
}

// Right-click "Paste" on empty timeline space - unlike Paste Day, this adds
// the clipboard's entries onto the target day at their original times
// without clearing whatever's already there first.
async function handlePasteEntries(date) {
  if (!copiedDayEntries.value) return
  if (copiedDayEntries.value.some((entry) => entryOverlapsDate(entry, date))) {
    showToast('This time range overlaps with an existing entry.')
    return
  }
  try {
    await pasteCopiedEntriesOnto(date)
    markPasteSuccess(date)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

// Right-click-drag an entry onto another day to copy it there at the exact
// same time - a mouse-driven shortcut for the same copy the right-click menu
// already offers. RIGHT_DRAG_THRESHOLD_PX is what tells a real drag apart
// from a plain right click that's just opening that menu instead.
const RIGHT_DRAG_THRESHOLD_PX = 6
const rightDragHoverIso = ref(null)

// Unlike a native context menu, the browser doesn't suppress its own
// `contextmenu` event just because a real drag happened - it still fires on
// release, right over wherever the pointer ends up (often the freshly-pasted
// entry's day, before that entry has even rendered). This flag, passed down
// to every DayTable, tells them to swallow that one stray event rather than
// pop the copy/paste menu on top of a drag that already did its own thing.
const suppressNextContextMenu = ref(false)

function dayIsoUnderPoint(x, y) {
  return document.elementFromPoint(x, y)?.closest('[data-date]')?.dataset.date ?? null
}

function handleEntryRightDragStart(entry, startX, startY) {
  let dragging = false

  function onMove(event) {
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < RIGHT_DRAG_THRESHOLD_PX) return
      dragging = true
      document.body.style.cursor = 'copy'
    }
    rightDragHoverIso.value = dayIsoUnderPoint(event.clientX, event.clientY)
  }

  async function onUp(event) {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    rightDragHoverIso.value = null
    if (!dragging) return
    suppressNextContextMenu.value = true
    setTimeout(() => {
      suppressNextContextMenu.value = false
    }, 300)
    const targetIso = dayIsoUnderPoint(event.clientX, event.clientY)
    if (!targetIso) return
    const targetDate = new Date(`${targetIso}T00:00:00`)
    const { id: _id, date: _date, ...payload } = entry
    if (entryOverlapsDate(payload, targetDate)) {
      showToast('This time range overlaps with an existing entry.')
      return
    }
    try {
      await store.createEntry({ ...payload, date: targetIso })
      markPasteSuccess(targetDate)
    } catch {
      // store.error is already set; the global error banner picks it up
    }
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

async function handlePasteDay(date) {
  if (!copiedDayEntries.value) return
  if (entriesForDate(date).length > 0) {
    pastePendingOverwriteDate.value = date
    return
  }
  try {
    await pasteCopiedEntriesOnto(date)
    markPasteSuccess(date)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

async function confirmPasteOverwrite() {
  const date = pastePendingOverwriteDate.value
  pastePendingOverwriteDate.value = null
  try {
    await store.clearDay(toISODate(date))
    await pasteCopiedEntriesOnto(date)
    markPasteSuccess(date)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

const pasteOverwriteMessage = computed(() => {
  const date = pastePendingOverwriteDate.value
  if (!date) return ''
  const label = date.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })
  return `${label} already has entries on it. Pasting here will replace all of them with the copied day, and this can't be undone.`
})

// Shared by any successful update (modal edit, drag-to-resize/move) - shows
// an undo toast that reverts the entry back to its pre-update field values.
function showUpdateUndoToast(id, previousPayload) {
  showToast('Entry updated.', {
    variant: 'warn',
    duration: 6000,
    actionLabel: 'Undo',
    onAction: async () => {
      try {
        await store.updateEntry(id, previousPayload)
      } catch {
        showToast("Couldn't undo that edit.")
      }
    },
  })
}

async function handleResizeEntry(id, startTime, endTime) {
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) return
  const previousPayload = entryPayload(entry)
  try {
    await store.updateEntry(id, {
      title: entry.title,
      date: entry.date,
      allDay: false,
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      entryType: entry.entryType,
      workLocation: entry.workLocation,
      taskItemId: entry.taskItemId,
      notes: entry.notes,
    })
    showUpdateUndoToast(id, previousPayload)
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

// Shift-linked edge resize: the shared boundary between two touching
// entries moved, so one shrank and the other grew by the same amount.
async function handleResizeLinkedEntries(shrink, grow) {
  const shrinkEntry = store.entries.find((e) => e.id === shrink.id)
  const growEntry = store.entries.find((e) => e.id === grow.id)
  if (!shrinkEntry || !growEntry) return
  const shrinkPrevious = entryPayload(shrinkEntry)
  const growPrevious = entryPayload(growEntry)
  try {
    // Shrink first - the backend rejects the growing side's update while
    // the shrinking side still occupies the space it's about to grow into.
    await store.updateEntry(shrink.id, {
      ...shrinkPrevious,
      startTime: `${shrink.startTime}:00`,
      endTime: `${shrink.endTime}:00`,
    })
    await store.updateEntry(grow.id, { ...growPrevious, startTime: `${grow.startTime}:00`, endTime: `${grow.endTime}:00` })
    showToast('Entries updated.', {
      variant: 'warn',
      duration: 6000,
      actionLabel: 'Undo',
      onAction: async () => {
        try {
          // Same shrink-then-grow ordering, roles swapped: whichever side
          // grew has to shrink back to its original size first.
          await store.updateEntry(grow.id, growPrevious)
          await store.updateEntry(shrink.id, shrinkPrevious)
        } catch {
          showToast("Couldn't undo that edit.")
        }
      },
    })
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

// Alt+click split - guards against a second alt+click landing on the same
// entry while the first split's two awaited store calls are still in
// flight, which would otherwise re-read the pre-split entry and could
// double-split it.
const splitsInFlight = new Set()

async function handleSplitEntry(id, splitTime) {
  if (splitsInFlight.has(id)) return
  splitsInFlight.add(id)
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) {
    splitsInFlight.delete(id)
    return
  }
  const previousPayload = entryPayload(entry)
  try {
    const result = await store.splitEntry(id, `${splitTime}:00`)
    if (!result || !result.second) return // total failure, or partial failure already toasted by the store
    showToast('Entry split.', {
      variant: 'warn',
      duration: 6000,
      actionLabel: 'Undo',
      onAction: async () => {
        try {
          await store.deleteEntry(result.second.id)
          await store.updateEntry(result.first.id, previousPayload)
        } catch {
          showToast("Couldn't undo that split.")
        }
      },
    })
  } catch {
    // store.error is already set; the global error banner picks it up
  } finally {
    splitsInFlight.delete(id)
  }
}

// Alt+Right-click on a shared edge - manual merge, not automatic.
async function handleMergeEntries(entryId, neighborId) {
  const entry = store.entries.find((e) => e.id === entryId)
  const neighbor = store.entries.find((e) => e.id === neighborId)
  if (!entry || !neighbor) return
  const entryPrevious = entryPayload(entry)
  const neighborPrevious = entryPayload(neighbor)
  try {
    await store.mergeEntries(entryId, neighborId)
    showToast('Entries merged.', {
      variant: 'warn',
      duration: 6000,
      actionLabel: 'Undo',
      onAction: async () => {
        try {
          // Shrink the survivor back to its original range first (safe -
          // nothing occupies the vacated space yet), then recreate the
          // deleted neighbor (also safe, exactly touching the now-shrunk
          // survivor).
          await store.updateEntry(entryId, entryPrevious)
          await store.createEntry(neighborPrevious)
        } catch {
          showToast("Couldn't undo that merge.")
        }
      },
    })
  } catch (err) {
    showToast(err.message || "Couldn't merge those entries.")
  }
}

async function handleSubmit(payload) {
  saving.value = true
  modalError.value = null
  const previousEntry = editingEntry.value
  try {
    if (previousEntry) {
      const previousPayload = entryPayload(previousEntry)
      await store.updateEntry(previousEntry.id, payload)
      closeModal()
      showUpdateUndoToast(previousEntry.id, previousPayload)
    } else {
      await store.createEntry(payload)
      closeModal()
    }
  } catch {
    modalError.value = store.error
  } finally {
    saving.value = false
  }
}

// Actually deletes the entry via the API. `announce` is turned off when the
// caller (confirmDeleteEntryAndTask below) wants to show its own combined
// toast instead of this one - showing both back-to-back would just have the
// second replace the first, since only one toast can be visible at a time.
async function performDelete(id, { announce = true } = {}) {
  saving.value = true
  const entry = store.entries.find((e) => e.id === id)
  try {
    await store.deleteEntry(id)
    closeModal()
    if (entry && announce) {
      showToast('Entry deleted.', {
        variant: 'error',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: () => restoreEntries([entryPayload(entry)]),
      })
    }
    return true
  } catch {
    modalError.value = store.error
    return false
  } finally {
    saving.value = false
  }
}

// Holds the entry/task pair while UnlinkOrDeleteTaskDialog is open - null
// otherwise. Deleting an entry that's the ONLY thing still linking its task
// would silently leave that task orphaned (fine on its own, tasks can exist
// unlinked), so this asks first rather than just doing it.
const pendingUnlinkOrDeleteEntry = ref(null)
const pendingUnlinkOrDeleteTask = ref(null)

async function handleDelete(id) {
  const entry = store.entries.find((e) => e.id === id)
  if (entry?.taskItemId != null) {
    const isOnlyLinkedEntry = !store.entries.some((e) => e.taskItemId === entry.taskItemId && e.id !== id)
    const task = isOnlyLinkedEntry ? tasksStore.tasks.find((t) => t.id === entry.taskItemId) : null
    if (task) {
      pendingUnlinkOrDeleteEntry.value = entry
      pendingUnlinkOrDeleteTask.value = task
      return
    }
  }
  await performDelete(id)
}

function cancelUnlinkOrDelete() {
  pendingUnlinkOrDeleteEntry.value = null
  pendingUnlinkOrDeleteTask.value = null
}

async function confirmUnlinkEntry() {
  const id = pendingUnlinkOrDeleteEntry.value?.id
  cancelUnlinkOrDelete()
  if (id != null) await performDelete(id)
}

// Restores a task+entry deleted together: recreates the task first (fresh
// id), then the entry pointing at that new id, then re-attaches any of the
// task's former subtasks that are still standalone (deleting a Group only
// unlinks its subtasks, doesn't delete them - see tasksStore.deleteTask) back
// onto the recreated Group. A subtask deleted independently in the meantime
// is just skipped rather than failing the whole restore.
async function restoreEntryAndTask(entrySnapshot, taskSnapshot, subtaskIds) {
  try {
    const newTask = await tasksStore.createTask(taskUpdatePayload(taskSnapshot))
    await store.createEntry({ ...entrySnapshot, taskItemId: newTask.id })
    for (const subtaskId of subtaskIds) {
      const subtask = tasksStore.tasks.find((t) => t.id === subtaskId && t.parentTaskId == null)
      if (!subtask) continue
      await tasksStore.updateTask(subtask.id, taskUpdatePayload(subtask, { parentTaskId: newTask.id }))
    }
  } catch {
    showToast("Couldn't restore everything - the task or entry may be missing.")
  }
}

async function confirmDeleteEntryAndTask() {
  const entry = pendingUnlinkOrDeleteEntry.value
  const task = pendingUnlinkOrDeleteTask.value
  cancelUnlinkOrDelete()
  if (!entry) return
  const entrySnapshot = entryPayload(entry)
  const subtaskIds = task ? tasksStore.tasks.filter((t) => t.parentTaskId === task.id).map((t) => t.id) : []

  const deleted = await performDelete(entry.id, { announce: false })
  if (!deleted || !task) return
  try {
    await tasksStore.deleteTask(task.id)
    showToast('Entry and task deleted.', {
      variant: 'error',
      duration: 6000,
      actionLabel: 'Undo',
      onAction: () => restoreEntryAndTask(entrySnapshot, task, subtaskIds),
    })
  } catch {
    showToast("Entry deleted, but couldn't delete the task.")
  }
}
</script>

<template>
  <div class="planner">
    <div v-if="store.error && !showModal" class="global-error">
      {{ store.error }}
      <button type="button" @click="store.clearError()"><X :size="16" /></button>
    </div>

    <WeekSummary
      :key="toISODate(currentMonday)"
      :monday="currentMonday"
      :weekly-total-hours="weeklyTotalHours"
      :weekly-target-hours="store.weeklyTargetHours"
      :overall-balance="store.overallBalance"
      :future-appointment-hours="store.futureAppointmentHours"
      :next-appointment="store.nextAppointment"
      :holidays-remaining="store.holidaysRemaining"
      :holiday-adjustment-days="store.holidayYearSettings[store.currentHolidayYear]?.adjustmentDays ?? 0"
      @prev="goPrevWeek"
      @next="goNextWeek"
      @today="goToday"
      @select-date="goToDate"
      @apply-adjustment="handleApplyAdjustment"
      @apply-holiday-adjustment="handleApplyHolidayAdjustment"
      @view-next-appointment="viewNextAppointment"
    />

    <p v-if="store.loading" class="loading">Loading…</p>

    <div class="days-header">
      <span class="days-kicker">Days</span>
      <div v-if="!isNarrowViewport" class="entry-legend">
        <span v-for="l in entryTypeLegend" :key="l.type" class="legend-item">
          <span class="legend-swatch" :style="{ background: l.bg, borderColor: l.border }"></span>{{ l.label }}
        </span>
      </div>
    </div>

    <div class="days-list">
      <DayTable
        v-for="(date, index) in visibleWeekDates"
        :key="toISODate(date)"
        :date="date"
        :row-index="index"
        :entries="entriesForDate(date)"
        :show-goal-diff="showGoalDiffFor(date)"
        :daily-target-hours="store.dailyTargetHours"
        :view-from-hour="store.viewFromHour"
        :view-till-hour="store.viewTillHour"
        :entry-type-colors="store.entryTypeColors"
        :has-copied-day="!!copiedDayEntries"
        :is-right-drag-target="rightDragHoverIso === toISODate(date)"
        :suppress-context-menu="suppressNextContextMenu"
        :paste-success="pasteSuccess"
        :tasks="tasksStore.tasks"
        @add="openAdd"
        @edit="openEdit"
        @clear-day="handleClearDay"
        @resize-entry="handleResizeEntry"
        @copy-day="handleCopyDay"
        @paste-day="handlePasteDay"
        @copy-entry="handleCopyEntry"
        @paste-entries="handlePasteEntries"
        @entry-right-drag-start="handleEntryRightDragStart"
        @view-task="handleViewTask"
        @resize-linked-entries="handleResizeLinkedEntries"
        @split-entry="handleSplitEntry"
        @merge-entries="handleMergeEntries"
      />
    </div>

    <!-- Mobile-only: the same legend, relocated below the day cards instead
         of above them - there's no room for it up top next to the week
         controls at this width, and it reads fine down here. -->
    <div v-if="isNarrowViewport" class="entry-legend entry-legend-bottom">
      <span v-for="l in entryTypeLegend" :key="l.type" class="legend-item">
        <span class="legend-swatch" :style="{ background: l.bg, borderColor: l.border }"></span>{{ l.label }}
      </span>
    </div>

    <div class="info-hint">
      <Info :size="14" class="info-hint-icon" />
      <div class="info-hint-body">
        <span>Drag inside a track to sketch a new entry.</span>
        <ul class="info-hint-shortcuts">
          <li><strong>Ctrl</strong> while dragging - snap to 15 minutes instead of 5</li>
          <li><strong>Shift</strong> while resizing a touching edge - move both entries' shared edge together</li>
          <li><strong>Alt</strong> + click an entry - split it in two at that point</li>
          <li><strong>Alt</strong> + right-click an edge - merge with the entry touching it</li>
        </ul>
        <span v-if="hiddenWeekendLabel"
          >{{ hiddenWeekendLabel }} hidden in <RouterLink to="/settings" class="info-link">settings</RouterLink>.</span
        >
      </div>
    </div>

    <EntryFormModal
      v-if="showModal"
      :entry="editingEntry"
      :default-date="modalDefaultDate"
      :default-start-time="modalPrefillTimes?.startTime"
      :default-end-time="modalPrefillTimes?.endTime"
      :tasks="tasksStore.tasks"
      :server-error="modalError"
      :saving="saving"
      @close="closeModal"
      @submit="handleSubmit"
      @delete="handleDelete"
    />

    <ConfirmDialog
      v-if="pastePendingOverwriteDate"
      title="Overwrite this day?"
      :message="pasteOverwriteMessage"
      confirm-label="Overwrite"
      danger
      @confirm="confirmPasteOverwrite"
      @cancel="pastePendingOverwriteDate = null"
    />

    <UnlinkOrDeleteTaskDialog
      v-if="pendingUnlinkOrDeleteTask"
      :task-name="pendingUnlinkOrDeleteTask.name"
      @unlink="confirmUnlinkEntry"
      @delete="confirmDeleteEntryAndTask"
      @cancel="cancelUnlinkOrDelete"
    />

    <TaskDetailModal
      v-if="viewTask"
      :task="viewTask"
      :subtasks="viewTask.subtasks || []"
      @close="closeViewTask"
      @edit="goToTasksBoard"
      @delete="goToTasksBoard"
    />

    <div v-if="ctrlHeld || shiftHeld || altHeld" class="modifier-overlay">
      <span v-if="ctrlHeld" class="modifier-chip">Ctrl · 15m snap</span>
      <span v-if="shiftHeld" class="modifier-chip">Shift · Link edges</span>
      <span v-if="altHeld" class="modifier-chip">Alt · Split / Merge edge</span>
    </div>
  </div>
</template>

<style scoped>
.planner {
  animation: fadeUp 0.34s var(--ease) both;
}

.days-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 2px 12px;
}

.days-kicker {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.entry-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dim);
}

.legend-swatch {
  width: 9px;
  height: 9px;
  border-radius: var(--r);
  border: 1px solid;
}

.entry-legend-bottom {
  padding: 4px 2px 18px;
  gap: 10px 16px;
}

.entry-legend-bottom .legend-item {
  font-size: 12.5px;
}

.entry-legend-bottom .legend-swatch {
  width: 10px;
  height: 10px;
}

.days-list {
  border-top: 1px solid var(--line);
  border-radius: var(--r2);
  overflow: hidden;
}

.info-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 18px 2px;
  font-size: 11.5px;
  color: var(--mute);
}

.info-hint-icon {
  flex: none;
  margin-top: 1px;
}

.info-hint-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-hint-shortcuts {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.info-hint-shortcuts li {
  line-height: 1.4;
}

.info-hint-shortcuts strong {
  color: var(--dim);
  font-weight: 600;
}

.info-link {
  color: var(--mute);
  text-decoration: underline;
}

.info-link:hover {
  color: var(--accent);
}

.loading {
  color: var(--mute);
  margin-bottom: 1rem;
}

.global-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--bad) 15%, transparent);
  color: var(--bad);
  border: 1px solid var(--bad);
  padding: 0.6rem 0.9rem;
  border-radius: var(--r2);
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.global-error button {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
}

.modifier-overlay {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 70;
  display: flex;
  gap: 8px;
  pointer-events: none;
}

.modifier-chip {
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--surface);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
</style>
