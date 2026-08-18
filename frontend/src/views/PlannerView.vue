<script setup>
import { ref, computed, onMounted } from 'vue'
import { X } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { getMonday, addDays, addWeeks, toISODate, durationHours, isWeekend } from '@/utils/date'
import DayTable from '@/components/DayTable.vue'
import WeekSummary from '@/components/WeekSummary.vue'
import EntryFormModal from '@/components/EntryFormModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import WeeklyBalanceModal from '@/components/WeeklyBalanceModal.vue'

const store = useScheduleStore()

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

const showSettingsModal = ref(false)
const settingsError = ref(null)
const savingSettings = ref(false)
const clearingOldEntries = ref(false)
const clearingAllData = ref(false)

const showWeeklyBalanceModal = ref(false)

onMounted(() => {
  store.fetchAll()
  store.fetchAdjustment()
  store.fetchWorkGoal()
})

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

function openSettings() {
  settingsError.value = null
  showSettingsModal.value = true
}

function closeSettings() {
  showSettingsModal.value = false
  settingsError.value = null
}

function openWeeklyBalance() {
  showWeeklyBalanceModal.value = true
}

function closeWeeklyBalance() {
  showWeeklyBalanceModal.value = false
}

async function handleSaveGoal(weeklyTargetMinutes) {
  savingSettings.value = true
  settingsError.value = null
  try {
    await store.setWorkGoal(weeklyTargetMinutes)
    closeSettings()
  } catch {
    settingsError.value = store.error
  } finally {
    savingSettings.value = false
  }
}

async function handleClearOldEntries() {
  clearingOldEntries.value = true
  settingsError.value = null
  try {
    await store.clearOldEntries()
  } catch {
    settingsError.value = store.error
  } finally {
    clearingOldEntries.value = false
  }
}

async function handleClearAllData() {
  clearingAllData.value = true
  settingsError.value = null
  try {
    await store.clearAllData()
  } catch {
    settingsError.value = store.error
  } finally {
    clearingAllData.value = false
  }
}

function openAdd(date, prefill = null) {
  editingEntry.value = null
  modalDefaultDate.value = date
  modalPrefillTimes.value = prefill
  modalError.value = null
  showModal.value = true
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
  try {
    await store.clearDay(toISODate(date))
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

async function handleResizeEntry(id, startTime, endTime) {
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) return
  try {
    await store.updateEntry(id, {
      title: entry.title,
      date: entry.date,
      allDay: false,
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      entryType: entry.entryType,
      workLocation: entry.workLocation,
      notes: entry.notes,
    })
  } catch {
    // store.error is already set; the global error banner picks it up
  }
}

async function handleSubmit(payload) {
  saving.value = true
  modalError.value = null
  try {
    if (editingEntry.value) {
      await store.updateEntry(editingEntry.value.id, payload)
    } else {
      await store.createEntry(payload)
    }
    closeModal()
  } catch {
    modalError.value = store.error
  } finally {
    saving.value = false
  }
}

async function handleDelete(id) {
  saving.value = true
  try {
    await store.deleteEntry(id)
    closeModal()
  } catch {
    modalError.value = store.error
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="planner">
    <div class="page-header">
      <h1 class="page-title">{{ store.greeting }}</h1>
    </div>

    <div v-if="store.error && !showModal" class="global-error">
      {{ store.error }}
      <button type="button" @click="store.clearError()"><X :size="16" /></button>
    </div>

    <WeekSummary
      :monday="currentMonday"
      :weekly-total-hours="weeklyTotalHours"
      :weekly-target-hours="store.weeklyTargetHours"
      :overall-balance="store.overallBalance"
      :future-appointment-hours="store.futureAppointmentHours"
      @prev="goPrevWeek"
      @next="goNextWeek"
      @today="goToday"
      @select-date="goToDate"
      @apply-adjustment="handleApplyAdjustment"
      @open-settings="openSettings"
      @open-weekly-balance="openWeeklyBalance"
    />

    <p v-if="store.loading" class="loading">Loading…</p>

    <DayTable
      v-for="date in visibleWeekDates"
      :key="toISODate(date)"
      :date="date"
      :entries="entriesForDate(date)"
      :show-goal-diff="showGoalDiffFor(date)"
      :daily-target-hours="store.dailyTargetHours"
      :view-from-hour="store.viewFromHour"
      :view-till-hour="store.viewTillHour"
      :entry-type-colors="store.entryTypeColors"
      @add="openAdd"
      @edit="openEdit"
      @clear-day="handleClearDay"
      @resize-entry="handleResizeEntry"
    />

    <EntryFormModal
      v-if="showModal"
      :entry="editingEntry"
      :default-date="modalDefaultDate"
      :default-start-time="modalPrefillTimes?.startTime"
      :default-end-time="modalPrefillTimes?.endTime"
      :server-error="modalError"
      :saving="saving"
      @close="closeModal"
      @submit="handleSubmit"
      @delete="handleDelete"
    />

    <SettingsModal
      v-if="showSettingsModal"
      :display-name="store.displayName"
      :weekly-target-minutes="store.weeklyTargetMinutes"
      :server-error="settingsError"
      :saving="savingSettings"
      :entries-count="store.entries.length"
      :old-entries-count="store.oldEntriesCount"
      :old-entries-cutoff-date="store.oldEntriesCutoffDate"
      :clearing-old-entries="clearingOldEntries"
      :clearing-all-data="clearingAllData"
      :view-from-hour="store.viewFromHour"
      :view-till-hour="store.viewTillHour"
      :entry-type-colors="store.entryTypeColors"
      :visible-weekdays="store.visibleWeekdays"
      @close="closeSettings"
      @submit="handleSaveGoal"
      @update-display-name="store.setDisplayName"
      @update-view-range="store.setViewRange"
      @update-entry-type-color="store.setEntryTypeColor"
      @toggle-visible-weekday="store.toggleVisibleWeekday"
      @clear-old-entries="handleClearOldEntries"
      @clear-all-data="handleClearAllData"
    />

    <WeeklyBalanceModal
      v-if="showWeeklyBalanceModal"
      :weeks="store.weeklyBalances"
      :manual-adjustment-hours="store.overallBalance.manualAdjustmentHours"
      @close="closeWeeklyBalance"
    />
  </div>
</template>

<style scoped>
.planner {
  max-width: 100%;
}

.page-header {
  margin-bottom: 1rem;
}

.page-title {
  font-size: 1.4rem;
  color: var(--color-heading);
}

.loading {
  opacity: 0.7;
  margin-bottom: 1rem;
}

.global-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
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
