<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'
import { BUSINESS_DAYS_PER_WEEK, DEFAULT_HOLIDAY_ALLOTMENT_DAYS } from '@/utils/constants'
import { ENTRY_TYPES } from '@/utils/entryTypeColors'
import { formatHours } from '@/utils/date'

const props = defineProps({
  displayName: { type: String, default: '' },
  weeklyTargetMinutes: { type: Number, required: true },
  serverError: { type: String, default: null },
  saving: { type: Boolean, default: false },
  entriesCount: { type: Number, required: true },
  oldEntriesCount: { type: Number, required: true },
  oldEntriesCutoffDate: { type: Date, required: true },
  clearingOldEntries: { type: Boolean, default: false },
  clearingAllData: { type: Boolean, default: false },
  viewFromHour: { type: Number, required: true },
  viewTillHour: { type: Number, required: true },
  entryTypeColors: { type: Object, required: true },
  visibleWeekdays: { type: Array, required: true },
  holidayYearSettings: { type: Object, required: true }, // { [year]: { allotmentDays, adjustmentDays } }
  holidayDaysUsedForYear: { type: Function, required: true },
})

const emit = defineEmits([
  'close',
  'submit',
  'update-display-name',
  'update-view-range',
  'update-entry-type-color',
  'toggle-visible-weekday',
  'fetch-holiday-year',
  'save-holiday-year',
  'clear-old-entries',
  'clear-all-data',
])

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
  { id: 'danger', label: 'Danger Zone' },
]
const activeTab = ref('general')

const FROM_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i) // 0-23
const TILL_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1-24

const nameInput = ref(props.displayName)
const viewFrom = ref(props.viewFromHour)
const viewTill = ref(props.viewTillHour)
const hours = ref(0)
const minutes = ref(0)
const localError = ref(null)

const holidayYearInput = ref(new Date().getFullYear())
const holidayAllotmentInput = ref(DEFAULT_HOLIDAY_ALLOTMENT_DAYS)

watch(nameInput, (name) => emit('update-display-name', name.trim()))

// Fetch whichever year is currently selected in the holiday editor - the
// parent caches results, so re-selecting a year already seen is a no-op.
watch(holidayYearInput, (year) => emit('fetch-holiday-year', year), { immediate: true })

// Once that year's setting arrives (or if switching to a year that isn't
// cached yet), reflect its allotment into the input.
watch(
  () => props.holidayYearSettings[holidayYearInput.value],
  (setting) => {
    holidayAllotmentInput.value = setting ? setting.allotmentDays : DEFAULT_HOLIDAY_ALLOTMENT_DAYS
  },
  { immediate: true },
)

const holidayUsedPreview = computed(() => props.holidayDaysUsedForYear(holidayYearInput.value))

const holidayRemainingPreview = computed(() => {
  const adjustment = props.holidayYearSettings[holidayYearInput.value]?.adjustmentDays ?? 0
  return holidayAllotmentInput.value - holidayUsedPreview.value + adjustment
})

function handleSaveHolidayYear() {
  const existingAdjustment = props.holidayYearSettings[holidayYearInput.value]?.adjustmentDays ?? 0
  emit('save-holiday-year', holidayYearInput.value, holidayAllotmentInput.value, existingAdjustment)
}

// Auto-correct rather than error: picking a "from" that would collide with
// "till" (or vice versa) nudges the other side just enough to stay valid,
// since this is an instant local preference, not a form with a submit step.
watch(viewFrom, (from) => {
  if (from >= viewTill.value) viewTill.value = Math.min(24, from + 1)
  emit('update-view-range', from, viewTill.value)
})

watch(viewTill, (till) => {
  if (till <= viewFrom.value) viewFrom.value = Math.max(0, till - 1)
  emit('update-view-range', viewFrom.value, till)
})

function handleClearOldClick() {
  if (!window.confirm(`Permanently delete ${props.oldEntriesCount} entr${props.oldEntriesCount === 1 ? 'y' : 'ies'} older than 1 year?`))
    return
  emit('clear-old-entries')
}

function handleClearAllClick() {
  if (!window.confirm(`Permanently delete all ${props.entriesCount} entries and reset your manual correction?`)) return
  emit('clear-all-data')
}

watch(
  () => props.weeklyTargetMinutes,
  (totalMinutes) => {
    hours.value = Math.floor(totalMinutes / 60)
    minutes.value = totalMinutes % 60
  },
  { immediate: true },
)

const dailyPreviewHours = computed(() => {
  const totalMinutes = Math.max(0, hours.value || 0) * 60 + Math.max(0, minutes.value || 0)
  return totalMinutes / 60 / BUSINESS_DAYS_PER_WEEK
})

function handleSubmit() {
  localError.value = null
  const totalMinutes = Math.max(0, hours.value || 0) * 60 + Math.max(0, minutes.value || 0)
  if (totalMinutes <= 0) {
    localError.value = 'Weekly goal must be greater than 0.'
    return
  }
  emit('submit', totalMinutes)
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>Settings</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

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

      <div v-if="activeTab === 'general'">
        <div class="field">
          <label for="settings-name">Your name</label>
          <input id="settings-name" v-model="nameInput" type="text" placeholder="(optional)" maxlength="60" />
        </div>

        <div class="field">
          <label>Timeline view range</label>
          <div class="goal-inputs">
            <label class="sub-field">
              From
              <select v-model.number="viewFrom">
                <option v-for="h in FROM_HOUR_OPTIONS" :key="h" :value="h">{{ String(h).padStart(2, '0') }}:00</option>
              </select>
            </label>
            <label class="sub-field">
              Till
              <select v-model.number="viewTill">
                <option v-for="h in TILL_HOUR_OPTIONS" :key="h" :value="h">{{ String(h % 24).padStart(2, '0') }}:00</option>
              </select>
            </label>
          </div>
          <p class="daily-preview">Only affects the timeline display - totals and warnings always use the full day.</p>
        </div>

        <div class="field">
          <label>Visible days</label>
          <div class="weekday-toggles">
            <button
              v-for="day in WEEKDAY_TOGGLES"
              :key="day.value"
              type="button"
              class="weekday-toggle"
              :class="{ active: visibleWeekdays.includes(day.value) }"
              @click="emit('toggle-visible-weekday', day.value)"
            >
              {{ day.label }}
            </button>
          </div>
          <p class="daily-preview">Hidden days are never shown, but still count toward totals and balance.</p>
        </div>

        <div class="field">
          <label>Vacation allotment</label>
          <div class="goal-inputs">
            <div class="unit-field">
              <input v-model.number="holidayYearInput" type="number" />
              <span class="unit-suffix">year</span>
            </div>
            <div class="unit-field">
              <input v-model.number="holidayAllotmentInput" type="number" min="0" step="0.5" />
              <span class="unit-suffix">days</span>
            </div>
          </div>
          <p class="daily-preview">
            {{ holidayUsedPreview }} used, {{ holidayRemainingPreview }} remaining for {{ holidayYearInput }}.
          </p>
          <button type="button" class="save-year-btn" @click="handleSaveHolidayYear">
            Save {{ holidayYearInput }} allotment
          </button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label>Weekly worktime goal</label>
            <div class="goal-inputs">
              <div class="unit-field">
                <input v-model.number="hours" type="number" min="0" />
                <span class="unit-suffix">h</span>
              </div>
              <div class="unit-field">
                <input v-model.number="minutes" type="number" min="0" max="59" />
                <span class="unit-suffix">min</span>
              </div>
            </div>
            <p class="daily-preview">= {{ formatHours(dailyPreviewHours) }} / day (over {{ BUSINESS_DAYS_PER_WEEK }} business days)</p>
          </div>

          <p v-if="localError || serverError" class="error-msg">{{ localError || serverError }}</p>

          <footer class="modal-footer">
            <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
            <button type="submit" class="save-btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
          </footer>
        </form>
      </div>

      <div v-else-if="activeTab === 'appearance'">
        <p class="tab-intro">Pick a color for each entry type - used for its blocks on the timeline.</p>
        <div class="color-list">
          <div v-for="type in ENTRY_TYPES" :key="type" class="color-row">
            <span class="color-type-label">{{ type }}</span>
            <input
              type="color"
              class="color-swatch-input"
              :value="entryTypeColors[type]"
              @input="emit('update-entry-type-color', type, $event.target.value)"
            />
          </div>
        </div>
      </div>

      <div v-else class="danger-zone">
        <div class="danger-action">
          <p>
            Permanently delete {{ oldEntriesCount }} entr{{ oldEntriesCount === 1 ? 'y' : 'ies' }} dated before
            {{ oldEntriesCutoffDate.toLocaleDateString() }}.
          </p>
          <button
            type="button"
            class="danger-btn"
            :disabled="clearingOldEntries || oldEntriesCount === 0"
            @click="handleClearOldClick"
          >
            {{ clearingOldEntries ? 'Clearing…' : 'Clear entries older than 1 year' }}
          </button>
        </div>

        <div class="danger-action">
          <p>Permanently delete all {{ entriesCount }} entries and reset your manual correction.</p>
          <button
            type="button"
            class="danger-btn"
            :disabled="clearingAllData || entriesCount === 0"
            @click="handleClearAllClick"
          >
            {{ clearingAllData ? 'Clearing…' : 'Clear all data' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 22rem;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.modal-header h2 {
  font-size: 1.1rem;
  color: var(--color-heading);
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
}

.tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.1rem;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  padding: 0.5rem 0.85rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text);
  opacity: 0.6;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.tab-btn:hover {
  opacity: 0.9;
}

.tab-btn.active {
  opacity: 1;
  color: var(--color-heading);
  border-bottom-color: #3b82f6;
}

.field {
  margin-bottom: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field > label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-heading);
}

.field > input[type='text'] {
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.goal-inputs {
  display: flex;
  gap: 0.75rem;
}

.sub-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  flex: 1;
}

.sub-field input,
.sub-field select {
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
  width: 100%;
}

.unit-field {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.unit-field input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.unit-field input:focus {
  outline: none;
}

.unit-suffix {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  opacity: 0.6;
  margin-left: 0.4rem;
  white-space: nowrap;
}

.daily-preview {
  font-size: 0.75rem;
  opacity: 0.7;
}

.weekday-toggles {
  display: flex;
  gap: 0.4rem;
}

.weekday-toggle {
  flex: 1;
  padding: 0.4rem 0;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  opacity: 0.6;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.weekday-toggle:hover {
  border-color: var(--color-border-hover);
}

.weekday-toggle.active {
  background: #3b82f6;
  border-color: #1d4ed8;
  color: #fff;
  opacity: 1;
}

.save-year-btn {
  margin-top: 0.5rem;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid #1d4ed8;
  background: #3b82f6;
  color: #fff;
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
}

.save-year-btn:hover {
  background: #2563eb;
}

.tab-intro {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.85rem;
}

.color-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0;
}

.color-type-label {
  font-size: 0.85rem;
  color: var(--color-text);
}

.color-swatch-input {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 2px solid var(--color-border);
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

.error-msg {
  color: #dc2626;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1rem;
}

.modal-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.save-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.danger-action {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.danger-action p {
  font-size: 0.75rem;
  opacity: 0.7;
}

.danger-btn {
  align-self: flex-start;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  background: transparent;
  border: 1px solid #dc2626;
  color: #dc2626;
}

.danger-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
