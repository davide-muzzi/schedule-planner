<script setup>
import { ref, computed } from 'vue'
import { X, Info } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAppShell } from '@/composables/useAppShell'
import { getMonday, addDays, addWeeks, toISODate, durationHours, isWeekend } from '@/utils/date'
import { ENTRY_TYPES, colorStyleForType } from '@/utils/entryTypeColors'
import { showToast } from '@/utils/toast'
import DayTable from '@/components/DayTable.vue'
import WeekSummary from '@/components/WeekSummary.vue'
import EntryFormModal from '@/components/EntryFormModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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

// "Sat", "Sun", or "Sat & Sun" - whichever weekend days are currently
// hidden. Empty when neither is, so the info-hint line can drop the clause
// entirely instead of pointing at a setting that isn't even in effect.
const hiddenWeekendLabel = computed(() => {
  const hidden = []
  if (!store.visibleWeekdays.includes(6)) hidden.push('Sat')
  if (!store.visibleWeekdays.includes(0)) hidden.push('Sun')
  return hidden.join(' & ')
})

const currentMonday = ref(getMonday(new Date()))
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

async function handleDelete(id) {
  saving.value = true
  const entry = store.entries.find((e) => e.id === id)
  try {
    await store.deleteEntry(id)
    closeModal()
    if (entry) {
      showToast('Entry deleted.', {
        variant: 'error',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: () => restoreEntries([entryPayload(entry)]),
      })
    }
  } catch {
    modalError.value = store.error
  } finally {
    saving.value = false
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
        :paste-success="pasteSuccess"
        :tasks="tasksStore.tasks"
        @add="openAdd"
        @edit="openEdit"
        @clear-day="handleClearDay"
        @resize-entry="handleResizeEntry"
        @copy-day="handleCopyDay"
        @paste-day="handlePasteDay"
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
      <Info :size="14" />
      <span
        >Drag inside a track to sketch a new entry<template v-if="hiddenWeekendLabel">
          · {{ hiddenWeekendLabel }} hidden in <RouterLink to="/settings" class="info-link">settings</RouterLink></template
        ></span
      >
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
  align-items: center;
  gap: 8px;
  padding: 18px 2px;
  font-size: 11.5px;
  color: var(--mute);
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
</style>
