<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'

const STATUSES = ['Open', 'InProgress', 'Done']
const STATUS_LABELS = { Open: 'Not started', InProgress: 'In Progress', Done: 'Done' }
const DEFAULT_COLOR = '#3b82f6'

const props = defineProps({
  task: { type: Object, default: null }, // null => create mode
  serverError: { type: String, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit', 'delete'])

const isEdit = computed(() => !!props.task)

function blankForm() {
  return {
    name: '',
    estimatedHours: 0,
    estimatedMinutes: 0,
    status: 'Open',
    hasColor: false,
    color: DEFAULT_COLOR,
    dueDate: '',
    notes: '',
  }
}

const form = ref(blankForm())
const localError = ref(null)
const originalFormSnapshot = ref(null)
const nameInputEl = ref(null)

watch(
  () => props.task,
  (task) => {
    if (task) {
      form.value = {
        name: task.name || '',
        estimatedHours: Math.floor(task.estimatedMinutes / 60),
        estimatedMinutes: task.estimatedMinutes % 60,
        status: task.status,
        hasColor: !!task.color,
        color: task.color || DEFAULT_COLOR,
        dueDate: task.dueDate || '',
        notes: task.notes || '',
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

function handleSubmit() {
  localError.value = null

  if (!form.value.name.trim()) {
    localError.value = 'Please enter a task name.'
    return
  }
  const totalMinutes = Number(form.value.estimatedHours) * 60 + Number(form.value.estimatedMinutes)
  if (!(totalMinutes > 0)) {
    localError.value = 'Estimated time must be more than 0.'
    return
  }

  const payload = {
    name: form.value.name.trim(),
    estimatedMinutes: totalMinutes,
    status: form.value.status,
    color: form.value.hasColor ? form.value.color : null,
    dueDate: form.value.dueDate || null,
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  emit('delete', props.task.id)
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
    if (props.saving || !isDirty.value) return
    event.preventDefault()
    handleSubmit()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  nameInputEl.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

// Same "mousedown started on the bare overlay" guard as EntryFormModal, so
// a text-selection drag that releases past the modal's edge doesn't close it.
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
        <h2>{{ isEdit ? 'Edit task' : 'Add task' }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>Name</label>
          <input ref="nameInputEl" v-model="form.name" type="text" placeholder="Task name" required />
        </div>

        <div class="field-row">
          <div class="field">
            <label>Est. h</label>
            <input v-model.number="form.estimatedHours" type="number" min="0" step="1" @keydown.escape.stop />
          </div>
          <div class="field">
            <label>Est. min</label>
            <input v-model.number="form.estimatedMinutes" type="number" min="0" max="59" step="1" @keydown.escape.stop />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Status</label>
            <select v-model="form.status" required @keydown.escape.stop>
              <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
            </select>
          </div>
          <div class="field">
            <label>Due date <span class="label-hint">(optional)</span></label>
            <input v-model="form.dueDate" type="date" @keydown.escape.stop />
          </div>
        </div>

        <div class="field">
          <label>Notes</label>
          <textarea v-model="form.notes" rows="3" placeholder="Details for this task..."></textarea>
        </div>

        <div class="field">
          <label>Color</label>
          <div class="color-row">
            <label class="checkbox-box">
              <input v-model="form.hasColor" type="checkbox" />
              Assign color
            </label>
            <input
              v-model="form.color"
              type="color"
              class="color-input"
              :disabled="!form.hasColor"
              title="Shown as diagonal stripes on this task's timeline entries"
            />
          </div>
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

label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-heading);
}

input[type='text'],
input[type='number'],
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

textarea {
  resize: vertical;
}

input[type='date'] {
  /* Tells the browser this field sits on a dark background, so its native
     calendar icon renders light instead of the default dark-on-dark. */
  color-scheme: dark;
}

.label-hint {
  font-weight: normal;
  color: var(--color-text);
  opacity: 0.6;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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

.checkbox-box input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: #3b82f6;
  cursor: pointer;
}

.color-input {
  width: 2.4rem;
  height: 2.2rem;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  cursor: pointer;
}

.color-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
