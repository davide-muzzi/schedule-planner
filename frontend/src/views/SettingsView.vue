<script setup>
import { ref, computed, watch } from 'vue'
import { TriangleAlert, CircleAlert, Info } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useAppShell } from '@/composables/useAppShell'
import { BUSINESS_DAYS_PER_WEEK, DEFAULT_HOLIDAY_ALLOTMENT_DAYS } from '@/utils/constants'
import { ENTRY_TYPES } from '@/utils/entryTypeColors'
import { formatHours, toISODate } from '@/utils/date'

const store = useScheduleStore()
const { theme, setTheme } = useAppShell()

// Inline error message for the two fields that hit the backend (weekly
// goal, holiday allotment) - keyed by field, null/absent while idle. No
// success indicator - a failed save just replaces the message, a
// successful one clears it.
const saveErrors = ref({})

function setSaveError(key, message) {
  saveErrors.value = { ...saveErrors.value, [key]: message || null }
}

// value matches Date.getDay() (0=Sun..6=Sat), ordered Mon-Sun to match how
// the week itself is displayed.
const WEEKDAY_TOGGLES = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'danger', label: 'My Data' },
]
const activeTab = ref('general')

const FROM_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i) // 0-23
const TILL_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1-24

const nameInput = ref(store.displayName)
const viewFrom = ref(store.viewFromHour)
const viewTill = ref(store.viewTillHour)
const hours = ref(0)
const minutes = ref(0)

const holidayYearInput = ref(new Date().getFullYear())
const holidayAllotmentInput = ref(DEFAULT_HOLIDAY_ALLOTMENT_DAYS)
let suppressHolidayAutoSave = false
let holidaySaveTimer = null

watch(nameInput, (name) => store.setDisplayName(name.trim()))

// Fetch whichever year is currently selected in the holiday editor - the
// store caches results, so re-selecting a year already seen is a no-op.
watch(holidayYearInput, (year) => store.fetchHolidayYearSetting(year), { immediate: true })

// Once that year's setting arrives (or if switching to a year that isn't
// cached yet), reflect its allotment into the input. This assignment alone
// would also trigger the auto-save watcher below, so it's flagged to skip
// that one cycle - switching years should only load, never immediately
// re-save the value it just loaded.
watch(
  () => store.holidayYearSettings[holidayYearInput.value],
  (setting) => {
    suppressHolidayAutoSave = true
    holidayAllotmentInput.value = setting ? setting.allotmentDays : DEFAULT_HOLIDAY_ALLOTMENT_DAYS
  },
  { immediate: true },
)

watch(holidayAllotmentInput, () => {
  if (suppressHolidayAutoSave) {
    suppressHolidayAutoSave = false
    return
  }
  clearTimeout(holidaySaveTimer)
  holidaySaveTimer = setTimeout(saveHolidayAllotment, 600)
})

async function saveHolidayAllotment() {
  if ((holidayAllotmentInput.value || 0) < 0) {
    setSaveError('holiday', 'Must be 0 or greater')
    return
  }
  const existingAdjustment = store.holidayYearSettings[holidayYearInput.value]?.adjustmentDays ?? 0
  try {
    await store.setHolidayYearSetting(holidayYearInput.value, holidayAllotmentInput.value, existingAdjustment)
    setSaveError('holiday', null)
  } catch (err) {
    setSaveError('holiday', err.message || 'Failed to save')
  }
}

const holidayUsedPreview = computed(() => store.holidayDaysUsedForYear(holidayYearInput.value))

const holidayRemainingPreview = computed(() => {
  const adjustment = store.holidayYearSettings[holidayYearInput.value]?.adjustmentDays ?? 0
  return holidayAllotmentInput.value - holidayUsedPreview.value + adjustment
})

// Auto-correct rather than error: picking a "from" that would collide with
// "till" (or vice versa) nudges the other side just enough to stay valid,
// since this is an instant local preference, not a form with a submit step.
watch(viewFrom, (from) => {
  if (from >= viewTill.value) viewTill.value = Math.min(24, from + 1)
  store.setViewRange(from, viewTill.value)
})

watch(viewTill, (till) => {
  if (till <= viewFrom.value) viewFrom.value = Math.max(0, till - 1)
  store.setViewRange(viewFrom.value, till)
})

function handleClearOldClick() {
  if (!window.confirm(`Permanently delete ${store.oldEntriesCount} entr${store.oldEntriesCount === 1 ? 'y' : 'ies'} older than 1 year?`))
    return
  handleClearOldEntries()
}

function handleClearAllClick() {
  if (!window.confirm(`Permanently delete all ${store.entries.length} entries and reset your manual correction?`)) return
  handleClearAllData()
}

const clearingOldEntries = ref(false)
const clearingAllData = ref(false)
const importingData = ref(false)
const dataError = ref(null)

async function handleClearOldEntries() {
  clearingOldEntries.value = true
  dataError.value = null
  try {
    await store.clearOldEntries()
  } catch {
    dataError.value = store.error
  } finally {
    clearingOldEntries.value = false
  }
}

async function handleClearAllData() {
  clearingAllData.value = true
  dataError.value = null
  try {
    await store.clearAllData()
  } catch {
    dataError.value = store.error
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

const importFileInput = ref(null)
const importError = ref(null)

function triggerImportPicker() {
  importError.value = null
  importFileInput.value?.click()
}

async function handleFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // clears the picked file, so re-selecting the same file later still fires @change
  if (!file) return

  importError.value = null
  let parsed
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    importError.value = 'That file is not valid JSON.'
    return
  }
  if (!parsed || !Array.isArray(parsed.entries)) {
    importError.value = "That file doesn't look like a schedule-planner backup - no entries array found."
    return
  }

  const count = parsed.entries.length
  const confirmed = window.confirm(
    `Import ${count} entr${count === 1 ? 'y' : 'ies'} from this file?\n\nThis PERMANENTLY REPLACES all current data - every entry, your goals, and your preferences - with what's in the file. This cannot be undone.`,
  )
  if (!confirmed) return

  importingData.value = true
  dataError.value = null
  try {
    await store.importSnapshot(parsed)
  } catch (err) {
    dataError.value = err.message || store.error
  } finally {
    importingData.value = false
  }
}

let suppressWeeklyGoalAutoSave = false
let weeklyGoalSaveTimer = null

// Same suppress-the-echo trick as the holiday allotment above - loading the
// current value from the store shouldn't immediately re-save it.
watch(
  () => store.weeklyTargetMinutes,
  (totalMinutes) => {
    suppressWeeklyGoalAutoSave = true
    hours.value = Math.floor(totalMinutes / 60)
    minutes.value = totalMinutes % 60
  },
  { immediate: true },
)

watch([hours, minutes], () => {
  if (suppressWeeklyGoalAutoSave) {
    suppressWeeklyGoalAutoSave = false
    return
  }
  clearTimeout(weeklyGoalSaveTimer)
  weeklyGoalSaveTimer = setTimeout(saveWeeklyGoal, 600)
})

const dailyPreviewHours = computed(() => {
  const totalMinutes = Math.max(0, hours.value || 0) * 60 + Math.max(0, minutes.value || 0)
  return totalMinutes / 60 / BUSINESS_DAYS_PER_WEEK
})

async function saveWeeklyGoal() {
  const totalMinutes = Math.max(0, hours.value || 0) * 60 + Math.max(0, minutes.value || 0)
  if (totalMinutes <= 0) {
    setSaveError('weeklyGoal', 'Must be greater than 0')
    return
  }
  try {
    await store.setWorkGoal(totalMinutes)
    setSaveError('weeklyGoal', null)
  } catch (err) {
    setSaveError('weeklyGoal', err.message || 'Failed to save')
  }
}
</script>

<template>
  <section class="page">
    <h1 class="title">Settings</h1>

    <div class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'general'" class="form">
      <div class="row">
        <div class="row-label">
          <div class="row-title">Your name</div>
          <div class="row-desc">Used in the greeting and on exports.</div>
        </div>
        <input id="settings-name" v-model="nameInput" type="text" placeholder="(optional)" maxlength="60" class="text-input" />
      </div>

      <div class="row">
        <div class="row-label">
          <div class="row-title">Timeline view range</div>
          <div class="row-desc">Only affects the timeline display - totals and warnings always use the full day.</div>
        </div>
        <div class="row-control">
          <div class="range-inputs">
            <select v-model.number="viewFrom" class="select-input">
              <option v-for="h in FROM_HOUR_OPTIONS" :key="h" :value="h">{{ String(h).padStart(2, '0') }}:00</option>
            </select>
            <span class="range-sep">–</span>
            <select v-model.number="viewTill" class="select-input">
              <option v-for="h in TILL_HOUR_OPTIONS" :key="h" :value="h">{{ String(h % 24).padStart(2, '0') }}:00</option>
            </select>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="row-label">
          <div class="row-title">Visible days</div>
          <div class="row-desc">Hidden days are never shown, but still count toward totals and balance.</div>
        </div>
        <div class="weekday-toggles">
          <button
            v-for="day in WEEKDAY_TOGGLES"
            :key="day.value"
            type="button"
            class="weekday-toggle"
            :class="{ active: store.visibleWeekdays.includes(day.value) }"
            @click="store.toggleVisibleWeekday(day.value)"
          >
            {{ day.label }}
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-label">
          <div class="row-title">Weekly worktime goal</div>
          <div class="row-desc">= {{ formatHours(dailyPreviewHours) }} / day (over {{ BUSINESS_DAYS_PER_WEEK }} business days)</div>
        </div>
        <div class="row-control">
          <div class="field-row">
            <div class="unit-field">
              <input v-model.number="hours" type="number" min="0" />
              <span class="unit-suffix">h</span>
            </div>
            <div class="unit-field">
              <input v-model.number="minutes" type="number" min="0" max="59" />
              <span class="unit-suffix">min</span>
            </div>
          </div>
          <p v-if="saveErrors.weeklyGoal" class="save-status">
            <CircleAlert :size="14" /> {{ saveErrors.weeklyGoal }}
          </p>
        </div>
      </div>

      <div class="row">
        <div class="row-label">
          <div class="row-title">Vacation allotment</div>
          <div class="row-desc">{{ holidayUsedPreview }} used, {{ holidayRemainingPreview }} remaining for {{ holidayYearInput }}.</div>
        </div>
        <div class="row-control">
          <div class="field-row">
            <div class="unit-field">
              <input v-model.number="holidayYearInput" type="number" />
              <span class="unit-suffix">year</span>
            </div>
            <div class="unit-field">
              <input v-model.number="holidayAllotmentInput" type="number" min="0" step="0.5" />
              <span class="unit-suffix">days</span>
            </div>
          </div>
          <p v-if="saveErrors.holiday" class="save-status">
            <CircleAlert :size="14" /> {{ saveErrors.holiday }}
          </p>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'appearance'" class="form">
      <div class="row">
        <div class="row-label">
          <div class="row-title">Theme</div>
          <div class="row-desc">Dark or light for the whole app.</div>
        </div>
        <div class="theme-buttons">
          <button type="button" class="pill-btn" :class="{ active: theme === 'dark' }" @click="setTheme('dark')">Dark</button>
          <button type="button" class="pill-btn" :class="{ active: theme === 'light' }" @click="setTheme('light')">Light</button>
        </div>
      </div>

      <div class="row">
        <div class="row-label">
          <div class="row-title">Entry colours</div>
          <div class="row-desc">Used for blocks on the timeline.</div>
        </div>
        <div class="color-list">
          <div v-for="type in ENTRY_TYPES" :key="type" class="color-row">
            <span class="color-type-label">{{ type }}</span>
            <input
              type="color"
              class="color-swatch-input"
              :value="store.entryTypeColors[type]"
              @input="store.setEntryTypeColor(type, $event.target.value)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-else class="danger-zone">
      <div class="data-action">
        <p>Export every entry, goal, and preference as a file you can restore from later.</p>
        <button type="button" class="export-btn" @click="handleExportData">Export data</button>
      </div>

      <div class="data-action">
        <p class="import-warning">
          <TriangleAlert :size="14" />
          Importing PERMANENTLY REPLACES all current data with the file's contents.
        </p>
        <button type="button" class="danger-btn" :disabled="importingData" @click="triggerImportPicker">
          {{ importingData ? 'Importing…' : 'Import data (replaces everything)' }}
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept="application/json"
          class="hidden-file-input"
          @change="handleFileSelected"
        />
        <p v-if="importError || dataError" class="error-msg">{{ importError || dataError }}</p>
      </div>

      <div class="danger-action">
        <p>
          Permanently delete {{ store.oldEntriesCount }} entr{{ store.oldEntriesCount === 1 ? 'y' : 'ies' }} dated before
          {{ store.oldEntriesCutoffDate.toLocaleDateString() }}.
        </p>
        <button
          type="button"
          class="danger-btn"
          :disabled="clearingOldEntries || store.oldEntriesCount === 0"
          @click="handleClearOldClick"
        >
          {{ clearingOldEntries ? 'Clearing…' : 'Clear entries older than 1 year' }}
        </button>
      </div>

      <div class="danger-action">
        <p>Permanently delete all {{ store.entries.length }} entries and reset your manual correction.</p>
        <button
          type="button"
          class="danger-btn"
          :disabled="clearingAllData || store.entries.length === 0"
          @click="handleClearAllClick"
        >
          {{ clearingAllData ? 'Clearing…' : 'Clear all data' }}
        </button>
      </div>
    </div>

    <div class="info-hint">
      <Info :size="14" />
      <span>Settings are saved automatically</span>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 900px;
}

.info-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 2px;
  font-size: 11.5px;
  color: var(--mute);
}

.title {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--fg);
  margin-bottom: 18px;
}

.tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 34px;
}

.tab-btn {
  position: relative;
  padding: 11px 18px;
  border: 0;
  background: transparent;
  color: var(--mute);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 400;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--fg);
}

.tab-btn.active {
  color: var(--fg);
  font-weight: 600;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
}

.form {
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 34px;
  align-items: start;
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
}

.row:first-child {
  padding-top: 0;
}

.row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 4px;
}

.row-desc {
  font-size: 11.5px;
  color: var(--mute);
}

.row-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-input,
.select-input {
  padding: 9px 11px;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  font-size: 13px;
  font-family: inherit;
}

.select-input {
  font-family: var(--font-mono);
}

.text-input {
  width: 100%;
  max-width: 320px;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-sep {
  color: var(--mute);
}

.weekday-toggles {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.weekday-toggle {
  min-width: 52px;
  padding: 8px 0;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--mute);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  font-weight: 600;
  cursor: pointer;
}

.weekday-toggle:hover {
  border-color: var(--accent);
}

.weekday-toggle.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

.unit-field {
  display: flex;
  align-items: center;
  padding: 9px 11px;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--surface);
}

.unit-field input {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--fg);
  font-size: 13px;
  font-family: var(--font-mono);
  width: 3rem;
}

.unit-field input:focus {
  outline: none;
}

.unit-suffix {
  font-size: 10px;
  font-weight: 600;
  color: var(--mute);
  margin-left: 6px;
  white-space: nowrap;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--bad);
}

.theme-buttons,
.pill-btn {
  display: flex;
}

.theme-buttons {
  gap: 6px;
}

.pill-btn {
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.pill-btn.active {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
}

.color-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  overflow: hidden;
  max-width: 380px;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--surface);
}

.color-type-label {
  font-size: 12.5px;
  color: var(--dim);
}

.color-swatch-input {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 2px solid var(--line-2);
  border-radius: 50%;
  background: none;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.color-swatch-input::-webkit-color-swatch-wrapper {
  padding: 0;
  border-radius: 50%;
}

.color-swatch-input::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}

.color-swatch-input::-moz-color-swatch {
  border: none;
  border-radius: 50%;
}

.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 26px;
  max-width: 560px;
}

.data-action {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--line);
}

.data-action p,
.danger-action p {
  font-size: 12px;
  color: var(--mute);
}

.data-action p.import-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--warn);
}

.danger-action {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.export-btn,
.danger-btn {
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: var(--r2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.export-btn {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--bg);
}

.export-btn:hover {
  filter: brightness(1.1);
}

.hidden-file-input {
  display: none;
}

.danger-btn {
  background: transparent;
  border: 1px solid var(--bad);
  color: var(--bad);
}

.danger-btn:hover {
  background: color-mix(in srgb, var(--bad) 15%, transparent);
}

.danger-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.error-msg {
  color: var(--bad);
  font-size: 0.85rem;
}
</style>
