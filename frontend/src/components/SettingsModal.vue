<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { BUSINESS_DAYS_PER_WEEK } from '@/utils/constants'
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
})

const emit = defineEmits([
  'close',
  'submit',
  'update-display-name',
  'update-view-range',
  'clear-old-entries',
  'clear-all-data',
])

const FROM_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i) // 0-23
const TILL_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1-24

const nameInput = ref(props.displayName)
const viewFrom = ref(props.viewFromHour)
const viewTill = ref(props.viewTillHour)
const hours = ref(0)
const minutes = ref(0)
const localError = ref(null)
const confirmingClearOld = ref(false)
const confirmingClearAll = ref(false)

watch(nameInput, (name) => emit('update-display-name', name.trim()))

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
  if (!confirmingClearOld.value) {
    confirmingClearOld.value = true
    return
  }
  emit('clear-old-entries')
}

function handleClearAllClick() {
  if (!confirmingClearAll.value) {
    confirmingClearAll.value = true
    return
  }
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
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close">&times;</button>
      </header>

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

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>Weekly worktime goal</label>
          <div class="goal-inputs">
            <label class="sub-field">
              h
              <input v-model.number="hours" type="number" min="0" />
            </label>
            <label class="sub-field">
              min
              <input v-model.number="minutes" type="number" min="0" max="59" />
            </label>
          </div>
          <p class="daily-preview">= {{ formatHours(dailyPreviewHours) }} / day (over {{ BUSINESS_DAYS_PER_WEEK }} business days)</p>
        </div>

        <p v-if="localError || serverError" class="error-msg">{{ localError || serverError }}</p>

        <footer class="modal-footer">
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="save-btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>

      <div class="danger-zone">
        <h3>Danger Zone</h3>

        <div class="danger-action">
          <p>
            Permanently delete {{ oldEntriesCount }} entr{{ oldEntriesCount === 1 ? 'y' : 'ies' }} dated before
            {{ oldEntriesCutoffDate.toLocaleDateString() }}.
          </p>
          <button
            type="button"
            class="danger-btn"
            :class="{ confirming: confirmingClearOld }"
            :disabled="clearingOldEntries || oldEntriesCount === 0"
            @click="handleClearOldClick"
          >
            {{
              clearingOldEntries ? 'Clearing…' : confirmingClearOld ? 'Click again to confirm' : 'Clear entries older than 1 year'
            }}
          </button>
        </div>

        <div class="danger-action">
          <p>Permanently delete all {{ entriesCount }} entries and reset your manual correction.</p>
          <button
            type="button"
            class="danger-btn"
            :class="{ confirming: confirmingClearAll }"
            :disabled="clearingAllData || entriesCount === 0"
            @click="handleClearAllClick"
          >
            {{ clearingAllData ? 'Clearing…' : confirmingClearAll ? 'Click again to confirm' : 'Clear all data' }}
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
  background: none;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text);
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

.daily-preview {
  font-size: 0.75rem;
  opacity: 0.7;
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
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.danger-zone h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: #dc2626;
  margin-bottom: 0.75rem;
}

.danger-action {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
}

.danger-action:last-child {
  margin-bottom: 0;
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

.danger-btn.confirming {
  background: #dc2626;
  color: #fff;
}

.danger-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
