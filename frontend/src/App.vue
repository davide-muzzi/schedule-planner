<script setup>
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useScheduleStore } from '@/stores/scheduleStore'
import { toISODate } from '@/utils/date'
import AppSidebar from '@/components/AppSidebar.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import Toast from '@/components/Toast.vue'
import { useSettingsModal } from '@/composables/useSettingsModal'

const store = useScheduleStore()
const settingsModal = useSettingsModal()

const settingsError = ref(null)
const clearingOldEntries = ref(false)
const clearingAllData = ref(false)
const importingData = ref(false)

onMounted(() => {
  store.fetchAll()
  store.fetchAdjustment()
  store.fetchWorkGoal()
  store.fetchHolidayYearSetting(store.currentHolidayYear)
})

function closeSettings() {
  settingsModal.close()
  settingsError.value = null
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

function handleExportData() {
  const blob = new Blob([JSON.stringify(store.exportSnapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `schedule-planner-backup-${toISODate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleImportData(data) {
  importingData.value = true
  settingsError.value = null
  try {
    await store.importSnapshot(data)
  } catch (err) {
    settingsError.value = err.message || store.error
  } finally {
    importingData.value = false
  }
}
</script>

<template>
  <div class="shell">
    <AppSidebar />
    <main class="shell-main">
      <RouterView />
    </main>
  </div>

  <SettingsModal
    v-if="settingsModal.isOpen.value"
    :display-name="store.displayName"
    :weekly-target-minutes="store.weeklyTargetMinutes"
    :server-error="settingsError"
    :entries-count="store.entries.length"
    :old-entries-count="store.oldEntriesCount"
    :old-entries-cutoff-date="store.oldEntriesCutoffDate"
    :clearing-old-entries="clearingOldEntries"
    :clearing-all-data="clearingAllData"
    :importing-data="importingData"
    :view-from-hour="store.viewFromHour"
    :view-till-hour="store.viewTillHour"
    :entry-type-colors="store.entryTypeColors"
    :visible-weekdays="store.visibleWeekdays"
    :holiday-year-settings="store.holidayYearSettings"
    :holiday-days-used-for-year="store.holidayDaysUsedForYear"
    :save-work-goal="store.setWorkGoal"
    :save-holiday-year="store.setHolidayYearSetting"
    @close="closeSettings"
    @update-display-name="store.setDisplayName"
    @update-view-range="store.setViewRange"
    @update-entry-type-color="store.setEntryTypeColor"
    @toggle-visible-weekday="store.toggleVisibleWeekday"
    @fetch-holiday-year="store.fetchHolidayYearSetting"
    @export-data="handleExportData"
    @import-data="handleImportData"
    @clear-old-entries="handleClearOldEntries"
    @clear-all-data="handleClearAllData"
  />

  <Toast />
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  min-height: 640px;
  overflow: hidden;
}

.shell-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 38px 44px 60px;
}
</style>
