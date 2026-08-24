<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'
import { toISODate } from '@/utils/date'
import { ENTRY_TYPES } from '@/utils/entryTypeColors'
import TimePartInput from './TimePartInput.vue'

const WORK_LOCATIONS = ['Office', 'Remote']
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = ['00', '15', '30', '45']

// Only entry types that genuinely make sense as a whole day (a vacation
// day, a public holiday, or a free-form "other" day off) can be All Day -
// Working/Lunch/Appointment/OvertimeCompensation always need an actual time
// range. Vacation and Public Holiday go further and auto-force it on,
// since a partial-day vacation/holiday isn't a real concept here; Other
// stays a plain optional toggle.
const ALL_DAY_ALLOWED_TYPES = ['Vacation', 'PublicHoliday', 'Other']
const AUTO_ALL_DAY_TYPES = ['Vacation', 'PublicHoliday']

const props = defineProps({
  entry: { type: Object, default: null }, // null => create mode
  defaultDate: { type: Date, required: true },
  defaultStartTime: { type: String, default: null }, // "HH:MM", from a timeline drag-to-create
  defaultEndTime: { type: String, default: null },
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
    startTime: props.defaultStartTime || '08:00',
    endTime: props.defaultEndTime || '12:00',
    entryType: 'Working',
    workLocation: 'Office',
    notes: '',
  }
}

const form = ref(blankForm())
const localError = ref(null)
const originalFormSnapshot = ref(null)
const titleInputEl = ref(null)

watch(
  () => props.entry,
  (entry) => {
    if (entry) {
      form.value = {
        title: entry.title || '',
        date: entry.date,
        allDay: entry.allDay,
        startTime: entry.startTime ? entry.startTime.slice(0, 5) : '08:00',
        endTime: entry.endTime ? entry.endTime.slice(0, 5) : '12:00',
        entryType: entry.entryType,
        workLocation: entry.workLocation || '',
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

// TimePartInput (custom combobox) instead of the native time-picker popup -
// that popup is rendered by the browser itself (outside the page's DOM) and
// has a known scroll-then-hover-to-snap rendering glitch no CSS/JS can reach
// into - and instead of a native <select> or <datalist>, since neither can
// do "always show the full option list, but also accept free typing"
// (<datalist> filters as you type; <select> can't take arbitrary values at
// all). Clamping/padding happens inside TimePartInput itself on blur, so
// this stays a plain passthrough - reformatting here on every keystroke
// would fight the user mid-typing. form.startTime/endTime stay the single
// source of truth as "HH:MM" strings; these just read/write into that
// string.
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

// Drives the All Day checkbox's disabled state - it's only ever checkable
// for types where a whole day actually makes sense.
const canToggleAllDay = computed(() => ALL_DAY_ALLOWED_TYPES.includes(form.value.entryType))

// Deliberately a @change handler, not a watcher: it must only react to the
// user actually picking a new type in the dropdown, not to the form being
// repopulated when switching which entry is being edited (a watcher on
// form.value.entryType can't tell those two apart, and would silently
// overwrite an already-saved, valid workLocation like "Remote" back to
// "Office" the moment you open that entry).
function handleEntryTypeChange() {
  if (AUTO_ALL_DAY_TYPES.includes(form.value.entryType)) {
    form.value.allDay = true
  } else if (!ALL_DAY_ALLOWED_TYPES.includes(form.value.entryType)) {
    form.value.allDay = false
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
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  emit('delete', props.entry.id)
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  // Enter anywhere in the form saves & closes, same as clicking Save -
  // except inside Notes (a textarea, where Enter should insert a newline)
  // or on another button (Cancel/Delete/Close, where Enter should activate
  // that button instead of hijacking it into a save).
  if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') {
    if (props.saving || !isDirty.value) return
    event.preventDefault()
    handleSubmit()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  titleInputEl.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

// A text-selection drag that starts inside the modal (e.g. dragging across
// a word in a field) but happens to release the mouse past the modal's
// edge lands its "click" event on the overlay too - @click.self alone
// can't tell that apart from an actual click on the backdrop. Only close
// when the *mousedown* also started on the bare overlay, not just the
// click's resolved target.
const overlayMouseDownOnSelf = ref(false)

function handleOverlayMouseDown(event) {
  overlayMouseDownOnSelf.value = event.target === event.currentTarget
}

function handleOverlayClick(event) {
  if (overlayMouseDownOnSelf.value && event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
  <div class="overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
    <div class="modal">
      <header class="modal-header">
        <h2>{{ isEdit ? 'Edit entry' : 'Add entry' }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>Title</label>
          <input ref="titleInputEl" v-model="form.title" type="text" placeholder="(optional)" />
        </div>

        <div class="field-row">
          <div class="field">
            <label>Date</label>
            <input v-model="form.date" type="date" required @keydown.escape.stop />
          </div>
          <div class="field checkbox-field">
            <span class="field-label-spacer">&nbsp;</span>
            <label class="checkbox-box" :class="{ disabled: !canToggleAllDay }" :title="canToggleAllDay ? '' : 'Only Vacation, Public Holiday and Other can be all day'">
              <input v-model="form.allDay" type="checkbox" :disabled="!canToggleAllDay" />
              All day
            </label>
          </div>
        </div>

        <div class="field-row" v-if="!form.allDay">
          <div class="field">
            <label>Start time</label>
            <div class="time-select">
              <TimePartInput v-model="startHour" :options="HOUR_OPTIONS" :max="23" />
              <span class="time-sep">:</span>
              <TimePartInput v-model="startMinute" :options="MINUTE_OPTIONS" :max="59" />
            </div>
          </div>
          <div class="field">
            <label>End time</label>
            <div class="time-select">
              <TimePartInput v-model="endHour" :options="HOUR_OPTIONS" :max="23" />
              <span class="time-sep">:</span>
              <TimePartInput v-model="endMinute" :options="MINUTE_OPTIONS" :max="59" />
            </div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Entry type</label>
            <select v-model="form.entryType" required @change="handleEntryTypeChange" @keydown.escape.stop>
              <option value="" disabled>Select...</option>
              <option v-for="t in ENTRY_TYPES" :key="t" :value="t">
                {{ t }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Work location</label>
            <select
              v-model="form.workLocation"
              :disabled="form.allDay || form.entryType !== 'Working'"
              @keydown.escape.stop
            >
              <option value="">(unset)</option>
              <option v-for="l in WORK_LOCATIONS" :key="l" :value="l">{{ l }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Notes</label>
          <textarea v-model="form.notes" rows="3" placeholder="(optional)"></textarea>
        </div>

        <p v-if="localError || serverError" class="error-msg">{{ localError || serverError }}</p>

        <footer class="modal-footer">
          <button v-if="isEdit" type="button" class="delete-btn" @click="handleDeleteClick">Delete</button>
          <div class="spacer"></div>
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="save-btn" :disabled="saving || !isDirty">{{ saving ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>
    </div>
  </div>
  </Teleport>
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
  display: flex;
  align-items: center;
  background: none;
  border: none;
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

.field-label-spacer {
  font-size: 0.8rem;
  font-weight: 600;
  visibility: hidden;
}

.checkbox-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-weight: normal;
  font-size: 0.9rem;
  cursor: pointer;
}

.checkbox-box.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-box input[type='checkbox']:disabled {
  cursor: not-allowed;
}

.checkbox-box input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: #3b82f6;
  cursor: pointer;
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

.time-sep {
  color: var(--color-text);
  opacity: 0.6;
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
</style>
