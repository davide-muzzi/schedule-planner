<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X, ChevronDown, Plus } from '@lucide/vue'
import { toISODate } from '@/utils/date'
import { ENTRY_TYPES } from '@/utils/entryTypeColors'
import { useAppShell } from '@/composables/useAppShell'
import { useTasksStore } from '@/stores/tasksStore'
import TimePartInput from './TimePartInput.vue'
import TaskFormModal from './TaskFormModal.vue'

const { isNarrowViewport } = useAppShell()
const tasksStore = useTasksStore()

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
  tasks: { type: Array, default: () => [] },
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
    taskItemId: null,
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
        taskItemId: entry.taskItemId ?? null,
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

// Done tasks are finished work, not something a new entry should still get
// linked to - but if this entry is already linked to one (marked Done after
// the link was made), it stays in the list so opening this entry doesn't
// silently show a blank/missing selection.
const selectableTasks = computed(() =>
  props.tasks.filter((t) => t.status !== 'Done' || t.id === form.value.taskItemId),
)

// Custom dropdown instead of a native <select> - Android renders <select> as
// its own full-screen OS picker rather than an inline list, which looks and
// behaves nothing like the rest of this form (or its desktop counterpart).
const showTaskDropdown = ref(false)

const selectedTaskLabel = computed(() => {
  const match = selectableTasks.value.find((t) => t.id === form.value.taskItemId)
  return match ? `#${match.id} - ${match.name}` : '(none)'
})

function toggleTaskDropdown() {
  showTaskDropdown.value = !showTaskDropdown.value
}

function selectTask(id) {
  form.value.taskItemId = id
  showTaskDropdown.value = false
}

function closeTaskDropdown() {
  showTaskDropdown.value = false
}

onMounted(() => document.addEventListener('click', closeTaskDropdown))
onBeforeUnmount(() => document.removeEventListener('click', closeTaskDropdown))

// "Create new Task" - opens TaskFormModal stacked on top of this one,
// prefilled with this entry's own length as the estimate. Saving it creates
// the task for real (same store call TasksView uses) and immediately links
// it to this entry, instead of the user having to back out, go create the
// task on the Tasks page, then come back and find it in the list.
const showCreateTaskModal = ref(false)
const createTaskError = ref(null)
const creatingTask = ref(false)

const newTaskEstimatedMinutes = computed(() => {
  const [startH, startM] = form.value.startTime.split(':').map(Number)
  const [endH, endM] = form.value.endTime.split(':').map(Number)
  return Math.max(0, endH * 60 + endM - (startH * 60 + startM))
})

function openCreateTask() {
  showTaskDropdown.value = false
  createTaskError.value = null
  showCreateTaskModal.value = true
}

async function handleCreateTaskSubmit(payload) {
  creatingTask.value = true
  createTaskError.value = null
  try {
    const created = await tasksStore.createTask(payload)
    form.value.taskItemId = created.id
    showCreateTaskModal.value = false
  } catch {
    createTaskError.value = tasksStore.error
  } finally {
    creatingTask.value = false
  }
}

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
  if (form.value.entryType !== 'Working') form.value.taskItemId = null
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
    taskItemId: form.value.entryType === 'Working' ? form.value.taskItemId || null : null,
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  emit('delete', props.entry.id)
}

function handleKeydown(event) {
  // The nested "Create new Task" modal has its own document-level Escape/Enter
  // handling - without this, both would fire for the same keypress, closing
  // or submitting this entry form out from under the task modal the user is
  // actually looking at.
  if (showCreateTaskModal.value) return
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
  // Auto-focusing Title pops the on-screen keyboard immediately on mobile,
  // shoving the whole modal around before the user's even looked at it -
  // desktop has no such cost, so it keeps the convenience of opening
  // straight into typing.
  if (!isNarrowViewport.value) titleInputEl.value?.focus()
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
          <label>Linked task</label>
          <div class="task-select">
            <button
              type="button"
              class="task-select-trigger"
              :disabled="form.entryType !== 'Working'"
              :title="form.entryType !== 'Working' ? 'Only Working entries can be linked to a task' : ''"
              @click.stop="toggleTaskDropdown"
              @keydown.escape.stop="showTaskDropdown = false"
            >
              <span class="task-select-value">{{ selectedTaskLabel }}</span>
              <ChevronDown :size="14" />
            </button>
            <div v-if="showTaskDropdown" class="task-select-dropdown" @click.stop>
              <button type="button" class="task-select-option" :class="{ active: form.taskItemId === null }" @click="selectTask(null)">
                (none)
              </button>
              <button
                v-for="t in selectableTasks"
                :key="t.id"
                type="button"
                class="task-select-option"
                :class="{ active: t.id === form.taskItemId }"
                @click="selectTask(t.id)"
              >
                #{{ t.id }} - {{ t.name }}
              </button>
              <button type="button" class="task-select-option task-select-create" @click="openCreateTask">
                <Plus :size="13" /> Create new Task
              </button>
            </div>
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

  <TaskFormModal
    v-if="showCreateTaskModal"
    :task="null"
    :initial-estimated-minutes="newTaskEstimatedMinutes"
    :server-error="createTaskError"
    :saving="creatingTask"
    @close="showCreateTaskModal = false"
    @submit="handleCreateTaskSubmit"
  />
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

.task-select {
  position: relative;
}

.task-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.task-select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-select-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-select-dropdown {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 12rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.task-select-option {
  display: block;
  width: 100%;
  padding: 0.4rem 0.6rem;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 0.85rem;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  font-family: inherit;
}

.task-select-option:hover {
  background: var(--color-background-soft);
}

.task-select-option.active {
  color: var(--color-heading);
  font-weight: 600;
}

.task-select-create {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-heading);
  font-weight: 600;
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
