<script setup>
import { ref, computed, onMounted } from 'vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { getMonday, getBusinessWeekDays, addDays, addWeeks, toISODate, durationHours } from '@/utils/date'
import DayTable from '@/components/DayTable.vue'
import WeekSummary from '@/components/WeekSummary.vue'
import EntryFormModal from '@/components/EntryFormModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import WeeklyBalanceModal from '@/components/WeeklyBalanceModal.vue'

const store = useScheduleStore()

const currentMonday = ref(getMonday(new Date()))
const weekDays = computed(() => getBusinessWeekDays(currentMonday.value))
const weekendDays = computed(() => [addDays(currentMonday.value, 5), addDays(currentMonday.value, 6)])
const visibleWeekendDays = computed(() => weekendDays.value.filter((date) => entriesForDate(date).length > 0))

const showModal = ref(false)
const editingEntry = ref(null)
const modalDefaultDate = ref(new Date())
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

const weeklyTotalHours = computed(() =>
  [...weekDays.value, ...weekendDays.value].reduce((sum, date) => {
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

function openAdd(date) {
  editingEntry.value = null
  modalDefaultDate.value = date
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
  modalError.value = null
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
      <div class="header-actions">
        <button type="button" class="settings-btn" @click="openWeeklyBalance">📊 Weekly Balance</button>
        <button type="button" class="settings-btn" @click="openSettings" aria-label="Settings">⚙ Settings</button>
      </div>
    </div>

    <div v-if="store.error && !showModal" class="global-error">
      {{ store.error }}
      <button type="button" @click="store.clearError()">&times;</button>
    </div>

    <WeekSummary
      :monday="currentMonday"
      :weekly-total-hours="weeklyTotalHours"
      :overall-balance="store.overallBalance"
      :future-appointment-hours="store.futureAppointmentHours"
      @prev="goPrevWeek"
      @next="goNextWeek"
      @today="goToday"
      @apply-adjustment="handleApplyAdjustment"
    />

    <div class="toolbar">
      <button type="button" class="add-entry-btn" @click="openAdd(new Date())">+ Add Entry</button>
    </div>

    <p v-if="store.loading" class="loading">Loading…</p>

    <DayTable
      v-for="date in weekDays"
      :key="toISODate(date)"
      :date="date"
      :entries="entriesForDate(date)"
      :show-goal-diff="weekHasAnyEntries"
      :daily-target-hours="store.dailyTargetHours"
      @add="openAdd"
      @edit="openEdit"
    />

    <DayTable
      v-for="date in visibleWeekendDays"
      :key="toISODate(date)"
      :date="date"
      :entries="entriesForDate(date)"
      :show-goal-diff="hasWorkingEntry(date)"
      :daily-target-hours="store.dailyTargetHours"
      @add="openAdd"
      @edit="openEdit"
    />

    <EntryFormModal
      v-if="showModal"
      :entry="editingEntry"
      :default-date="modalDefaultDate"
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
      @close="closeSettings"
      @submit="handleSaveGoal"
      @update-display-name="store.setDisplayName"
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
}

.page-title {
  font-size: 1.4rem;
  color: var(--color-heading);
}

.settings-btn {
  font-size: 0.8rem;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.settings-btn:hover {
  border-color: var(--color-border-hover);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.add-entry-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
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
  background: none;
  border: none;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
}
</style>
