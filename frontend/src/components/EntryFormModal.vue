<script setup>
import { ref, computed, watch } from 'vue'
import { toISODate } from '@/utils/date'
import { COLOR_PRESETS } from '@/utils/colorPresets'

const ENTRY_TYPES = ['Working', 'Sick', 'Vacation', 'Appointment', 'OvertimeCompensation', 'Other']
const WORK_LOCATIONS = ['Office', 'Remote']
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const props = defineProps({
  entry: { type: Object, default: null }, // null => create mode
  defaultDate: { type: Date, required: true },
  serverError: { type: String, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit', 'delete'])

const isEdit = computed(() => !!props.entry)

function blankForm() {
  return {
    title: '',
    date: toISODate(props.defaultDate),
    allDay: false,
    startTime: '09:00',
    endTime: '17:00',
    entryType: 'Working',
    workLocation: 'Office',
    colorPreset: 'Blue',
    notes: '',
  }
}

const form = ref(blankForm())
const localError = ref(null)
const confirmingDelete = ref(false)
const originalFormSnapshot = ref(null)

watch(
  () => props.entry,
  (entry) => {
    confirmingDelete.value = false
    if (entry) {
      form.value = {
        title: entry.title || '',
        date: entry.date,
        allDay: entry.allDay,
        startTime: entry.startTime ? entry.startTime.slice(0, 5) : '09:00',
        endTime: entry.endTime ? entry.endTime.slice(0, 5) : '17:00',
        entryType: entry.entryType,
        workLocation: entry.workLocation || '',
        colorPreset: entry.colorPreset,
        notes: entry.notes || '',
      }
    } else {
      form.value = blankForm()
    }
    originalFormSnapshot.value = JSON.stringify(form.value)
  },
  { immediate: true },
)

// Create mode has no "original" to diff against, so it's always considered dirty.
const isDirty = computed(() => !isEdit.value || JSON.stringify(form.value) !== originalFormSnapshot.value)

// Plain <select>s for hour/minute instead of the native time-picker popup -
// that popup is rendered by the browser itself (outside the page's DOM), and
// has a known scroll-then-hover-to-snap rendering glitch that no amount of
// CSS/JS can reach into. form.startTime/endTime stay the single source of
// truth as "HH:MM" strings; these just read/write into that same string.
function makeTimePart(field, index) {
  return computed({
    get: () => form.value[field].split(':')[index] || '00',
    set: (val) => {
      const parts = form.value[field].split(':')
      parts[index] = val
      form.value[field] = parts.join(':')
    },
  })
}

const startHour = makeTimePart('startTime', 0)
const startMinute = makeTimePart('startTime', 1)
const endHour = makeTimePart('endTime', 0)
const endMinute = makeTimePart('endTime', 1)

// You can't "work" an all-day entry - if All Day gets checked while Working
// is selected, force an explicit re-choice instead of silently keeping an
// entry type that's now nonsensical. Work location is cleared outright since
// it never applies to a non-Working entry.
watch(
  () => form.value.allDay,
  (allDay) => {
    if (allDay) {
      if (form.value.entryType === 'Working') {
        form.value.entryType = ''
      }
      form.value.workLocation = ''
    }
  },
)

// Deliberately a @change handler, not a watcher: it must only react to the
// user actually picking a new type in the dropdown, not to the form being
// repopulated when switching which entry is being edited (a watcher on
// form.value.entryType can't tell those two apart, and would silently
// overwrite an already-saved, valid workLocation like "Remote" back to
// "Office" the moment you open that entry).
function handleEntryTypeChange() {
  if (form.value.entryType === 'Vacation') {
    form.value.allDay = true
  }
  form.value.workLocation = form.value.entryType === 'Working' ? 'Office' : ''
}

function handleSubmit() {
  localError.value = null

  if (!form.value.entryType) {
    localError.value = 'Please select an entry type.'
    return
  }
  if (!form.value.allDay && form.value.endTime <= form.value.startTime) {
    localError.value = 'End time must be after start time.'
    return
  }

  const payload = {
    title: form.value.title.trim() || null,
    date: form.value.date,
    allDay: form.value.allDay,
    startTime: form.value.allDay ? null : `${form.value.startTime}:00`,
    endTime: form.value.allDay ? null : `${form.value.endTime}:00`,
    entryType: form.value.entryType,
    workLocation: form.value.workLocation || null,
    colorPreset: form.value.colorPreset,
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  emit('delete', props.entry.id)
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>{{ isEdit ? 'Edit entry' : 'Add entry' }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close">&times;</button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>Title</label>
          <input v-model="form.title" type="text" placeholder="(optional)" />
        </div>

        <div class="field-row">
          <div class="field">
            <label>Date</label>
            <input v-model="form.date" type="date" required />
          </div>
          <div class="field checkbox-field">
            <label>
              <input v-model="form.allDay" type="checkbox" />
              All day
            </label>
          </div>
        </div>

        <div class="field-row" v-if="!form.allDay">
          <div class="field">
            <label>Start time</label>
            <div class="time-select">
              <select v-model="startHour">
                <option v-for="h in HOUR_OPTIONS" :key="h" :value="h">{{ h }}</option>
              </select>
              <span class="time-sep">:</span>
              <select v-model="startMinute">
                <option v-for="m in MINUTE_OPTIONS" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>End time</label>
            <div class="time-select">
              <select v-model="endHour">
                <option v-for="h in HOUR_OPTIONS" :key="h" :value="h">{{ h }}</option>
              </select>
              <span class="time-sep">:</span>
              <select v-model="endMinute">
                <option v-for="m in MINUTE_OPTIONS" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Entry type</label>
            <select v-model="form.entryType" required @change="handleEntryTypeChange">
              <option value="" disabled>Select...</option>
              <option v-for="t in ENTRY_TYPES" :key="t" :value="t" :disabled="t === 'Working' && form.allDay">
                {{ t }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Work location</label>
            <select v-model="form.workLocation" :disabled="form.allDay">
              <option value="">(unset)</option>
              <option v-for="l in WORK_LOCATIONS" :key="l" :value="l">{{ l }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Color</label>
          <div class="color-picker">
            <button
              v-for="c in COLOR_PRESETS"
              :key="c"
              type="button"
              class="color-swatch"
              :class="{ selected: form.colorPreset === c }"
              :style="{ backgroundColor: `var(--swatch-${c})` }"
              :data-preset="c"
              :title="c"
              @click="form.colorPreset = c"
            ></button>
          </div>
        </div>

        <div class="field">
          <label>Notes</label>
          <textarea v-model="form.notes" rows="3" placeholder="(optional)"></textarea>
        </div>

        <p v-if="localError || serverError" class="error-msg">{{ localError || serverError }}</p>

        <footer class="modal-footer">
          <button
            v-if="isEdit"
            type="button"
            class="delete-btn"
            :class="{ confirming: confirmingDelete }"
            @click="handleDeleteClick"
          >
            {{ confirmingDelete ? 'Click again to confirm' : 'Delete' }}
          </button>
          <div class="spacer"></div>
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="save-btn" :disabled="saving || !isDirty">{{ saving ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>
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
  max-width: 26rem;
  max-height: 90vh;
  overflow-y: auto;
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
  gap: 0.3rem;
}

.field-row {
  display: flex;
  gap: 1rem;
}

.field-row .field {
  flex: 1;
}

.checkbox-field {
  justify-content: center;
}

.checkbox-field label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: normal;
}

label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-heading);
}

input[type='text'],
input[type='date'],
select,
textarea {
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

input[type='date'] {
  /* Tells the browser this field sits on a dark background, so its native
     calendar icon renders light instead of the default dark-on-dark. */
  color-scheme: dark;
}

.time-select {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.time-select select {
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.time-sep {
  color: var(--color-text);
  opacity: 0.6;
}

.color-picker {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  --swatch-Red: #ef4444;
  --swatch-Orange: #f97316;
  --swatch-Yellow: #eab308;
  --swatch-Green: #22c55e;
  --swatch-Blue: #3b82f6;
  --swatch-Grey: #9ca3af;
  --swatch-White: #f8fafc;
}

.color-swatch {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  cursor: pointer;
}

.color-swatch.selected {
  border-color: var(--color-heading);
  box-shadow: 0 0 0 2px var(--color-background);
  outline: 2px solid var(--color-heading);
}

.error-msg {
  color: #dc2626;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1rem;
}

.spacer {
  flex: 1;
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

.delete-btn {
  background: transparent;
  border: 1px solid #dc2626;
  color: #dc2626;
}

.delete-btn.confirming {
  background: #dc2626;
  color: #fff;
}
</style>
