<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X, Plus, ChevronDown, ChevronUp } from '@lucide/vue'
import { useAppShell } from '@/composables/useAppShell'
import { useTasksStore } from '@/stores/tasksStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTagsStore } from '@/stores/tagsStore'
import { formatHours } from '@/utils/date'
import ChoiceDialog from './ChoiceDialog.vue'

const { isNarrowViewport } = useAppShell()
const tasksStore = useTasksStore()
const scheduleStore = useScheduleStore()
const tagsStore = useTagsStore()

const STATUSES = ['Backlog', 'Planned', 'InProgress', 'Done']
const STATUS_LABELS = { Backlog: 'Backlog', Planned: 'Planned', InProgress: 'In Progress', Done: 'Done' }
const PRIORITIES = ['None', 'Low', 'Medium', 'High']
const PRIORITY_LABELS = { None: 'None', Low: 'Low', Medium: 'Medium', High: 'High' }
const DEFAULT_COLOR = '#3b82f6'

const props = defineProps({
  task: { type: Object, default: null }, // null => create mode
  // Seeds the estimate in create mode only (e.g. the Planner's "Create new
  // Task" shortcut passes the entry's own length) - ignored once task is set,
  // since an edit's estimate comes from the task itself.
  initialEstimatedMinutes: { type: Number, default: null },
  // Hides the Task/Group type picker and forces plain Task, for quick-create
  // flows nested inside another modal (the Planner's "Create new Task", and
  // a Group's own "Create new subtask") where a Group would never make
  // sense as the thing being created.
  disableGroupType: { type: Boolean, default: false },
  serverError: { type: String, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit', 'delete'])

const isEdit = computed(() => !!props.task)

function blankForm() {
  const minutes = props.initialEstimatedMinutes ?? 0
  return {
    name: '',
    taskType: 'Task',
    estimatedHours: Math.floor(minutes / 60),
    estimatedMinutes: minutes % 60,
    status: 'Backlog',
    priority: 'None',
    tagIds: [],
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

// Adding/removing/creating a subtask commits immediately (its own API
// call), not through this form's own Save - but the button should still
// enable so the user can close out or save any other pending field edits
// without touching a field first.
const subtasksChanged = ref(false)

watch(
  () => props.task,
  (task) => {
    if (task) {
      form.value = {
        name: task.name || '',
        taskType: task.taskType || 'Task',
        estimatedHours: Math.floor(task.estimatedMinutes / 60),
        estimatedMinutes: task.estimatedMinutes % 60,
        status: task.status,
        priority: task.priority || 'None',
        tagIds: (task.tags || []).map((t) => t.id),
        hasColor: !!task.color,
        color: task.color || DEFAULT_COLOR,
        dueDate: task.dueDate || '',
        notes: task.notes || '',
      }
    } else {
      form.value = blankForm()
    }
    originalFormSnapshot.value = JSON.stringify(form.value)
    // Reset for the task now being edited (or create mode) - a subtask
    // change made before switching away shouldn't linger as "dirty" here.
    subtasksChanged.value = false
  },
  { immediate: true },
)

// Create mode has no "original" to diff against, so it's always considered dirty.
const isDirty = computed(
  () => !isEdit.value || subtasksChanged.value || JSON.stringify(form.value) !== originalFormSnapshot.value,
)

const isGroup = computed(() => form.value.taskType === 'Group')

// A Group's planned time is always the live sum of its subtasks, never a
// value typed into this form - see plannedMinutesForGroup's own comment.
const subtasks = computed(() =>
  props.task ? tasksStore.tasks.filter((t) => t.parentTaskId === props.task.id) : [],
)
const groupPlannedMinutes = computed(() => subtasks.value.reduce((sum, t) => sum + t.estimatedMinutes, 0))

function tagIdsOf(task) {
  return (task.tags || []).map((t) => t.id)
}

// --- Tag picker ---

const showTagPicker = ref(false)
const tagSearch = ref('')
const creatingTag = ref(false)
const tagCreateError = ref(null)

const selectedTags = computed(() =>
  form.value.tagIds.map((id) => tagsStore.tags.find((t) => t.id === id)).filter(Boolean),
)

const eligibleTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  return tagsStore.tags.filter(
    (t) => !form.value.tagIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)),
  )
})

const tagExactMatchExists = computed(() =>
  tagsStore.tags.some((t) => t.name.toLowerCase() === tagSearch.value.trim().toLowerCase()),
)

function addTagId(id) {
  if (!form.value.tagIds.includes(id)) form.value.tagIds.push(id)
  tagSearch.value = ''
}

function removeTagId(id) {
  form.value.tagIds = form.value.tagIds.filter((tid) => tid !== id)
}

// Creating a brand new tag commits immediately (it needs a real id before
// it can be assigned) - but assigning it to this task is still just a
// pending form field, submitted with everything else on Save.
async function createAndAddTag() {
  const name = tagSearch.value.trim()
  if (!name) return
  creatingTag.value = true
  tagCreateError.value = null
  try {
    const created = await tagsStore.createTag({ name, color: null })
    addTagId(created.id)
  } catch {
    tagCreateError.value = tagsStore.error
  } finally {
    creatingTag.value = false
  }
}

function handleSubmit() {
  localError.value = null

  if (!form.value.name.trim()) {
    localError.value = 'Please enter a task name.'
    return
  }
  const totalMinutes = Number(form.value.estimatedHours) * 60 + Number(form.value.estimatedMinutes)
  if (!isGroup.value && !(totalMinutes > 0)) {
    localError.value = 'Estimated time must be more than 0.'
    return
  }

  const payload = {
    name: form.value.name.trim(),
    estimatedMinutes: isGroup.value ? 0 : totalMinutes,
    status: form.value.status,
    priority: form.value.priority,
    taskType: form.value.taskType,
    parentTaskId: props.task?.parentTaskId ?? null,
    tagIds: form.value.tagIds,
    color: form.value.hasColor ? form.value.color : null,
    dueDate: form.value.dueDate || null,
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  emit('delete', props.task.id)
}

// --- Subtask management (edit mode, Group only) ---

const showAddExisting = ref(false)
const addExistingSearch = ref('')
const showCreateSubtask = ref(false)
const subtaskActionError = ref(null)
const subtaskActionBusy = ref(false)
const pendingRelink = ref(null) // { task, entries } while the relink confirm is open

const eligibleExistingTasks = computed(() => {
  const q = addExistingSearch.value.trim().toLowerCase()
  return tasksStore.tasks.filter((t) => {
    if (t.id === props.task?.id) return false
    if (t.taskType === 'Group') return false
    if (t.parentTaskId != null) return false
    if (!q) return true
    return t.name.toLowerCase().includes(q) || String(t.id).includes(q)
  })
})

function subtaskUpdatePayload(task, overrides) {
  return {
    name: task.name,
    estimatedMinutes: task.estimatedMinutes,
    status: task.status,
    priority: task.priority,
    taskType: task.taskType,
    parentTaskId: task.parentTaskId,
    tagIds: tagIdsOf(task),
    color: task.color,
    notes: task.notes,
    dueDate: task.dueDate,
    ...overrides,
  }
}

async function addExistingSubtask(task) {
  subtaskActionError.value = null
  const linked = scheduleStore.entries.filter((e) => e.taskItemId === task.id)
  if (linked.length > 0) {
    pendingRelink.value = { task, entries: linked }
    return
  }
  await commitAddSubtask(task)
}

async function commitAddSubtask(task) {
  subtaskActionBusy.value = true
  try {
    await tasksStore.updateTask(task.id, subtaskUpdatePayload(task, { parentTaskId: props.task.id }))
    subtasksChanged.value = true
    showAddExisting.value = false
    addExistingSearch.value = ''
  } catch {
    subtaskActionError.value = tasksStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

async function confirmRelink() {
  const { task, entries } = pendingRelink.value
  subtaskActionBusy.value = true
  try {
    for (const entry of entries) {
      await scheduleStore.updateEntry(entry.id, { ...entry, taskItemId: props.task.id })
    }
    await tasksStore.updateTask(task.id, subtaskUpdatePayload(task, { parentTaskId: props.task.id }))
    subtasksChanged.value = true
    pendingRelink.value = null
    showAddExisting.value = false
    addExistingSearch.value = ''
  } catch {
    subtaskActionError.value = tasksStore.error || scheduleStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

function cancelRelink() {
  pendingRelink.value = null
}

async function removeSubtask(task) {
  subtaskActionError.value = null
  subtaskActionBusy.value = true
  try {
    await tasksStore.updateTask(task.id, subtaskUpdatePayload(task, { parentTaskId: null }))
    subtasksChanged.value = true
  } catch {
    subtaskActionError.value = tasksStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

async function handleCreateSubtaskSubmit(payload) {
  subtaskActionBusy.value = true
  subtaskActionError.value = null
  try {
    await tasksStore.createTask({ ...payload, taskType: 'Task', parentTaskId: props.task.id })
    subtasksChanged.value = true
    showCreateSubtask.value = false
  } catch {
    subtaskActionError.value = tasksStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

function handleKeydown(event) {
  // The nested "Create new subtask" / relink-confirm dialogs have their own
  // Escape/Enter handling - same reasoning as EntryFormModal's guard.
  if (showCreateSubtask.value || pendingRelink.value) return
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
  // Auto-focusing pops the on-screen keyboard immediately on mobile, shoving
  // the whole modal around before the user's even looked at it - desktop has
  // no such cost, so it keeps the convenience of opening straight into typing.
  if (!isNarrowViewport.value) nameInputEl.value?.focus()
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

        <div v-if="!disableGroupType" class="field">
          <label>Type</label>
          <div v-if="!isEdit" class="pill-row">
            <button
              type="button"
              class="pill"
              :class="{ active: form.taskType === 'Task' }"
              @click="form.taskType = 'Task'"
            >
              Task
            </button>
            <button
              type="button"
              class="pill"
              :class="{ active: form.taskType === 'Group' }"
              @click="form.taskType = 'Group'"
            >
              Group
            </button>
          </div>
          <p v-else class="type-readonly">
            {{ isGroup ? 'Group' : 'Task' }}
            <span class="label-hint">(type can't be changed after creation)</span>
          </p>
          <p v-if="!isEdit" class="label-hint">
            {{ form.taskType === 'Group'
              ? "A Group holds subtasks - its planned time is their total, and it's what you link to a planner entry."
              : 'A standalone task with its own planned time.' }}
          </p>
        </div>

        <div v-if="!isGroup" class="field-row">
          <div class="field">
            <label>Est. h</label>
            <input v-model.number="form.estimatedHours" type="number" min="0" step="1" @keydown.escape.stop />
          </div>
          <div class="field">
            <label>Est. min</label>
            <input v-model.number="form.estimatedMinutes" type="number" min="0" max="59" step="1" @keydown.escape.stop />
          </div>
        </div>
        <div v-else class="field">
          <label>Planned time</label>
          <p class="group-total">
            {{ hoursFor(groupPlannedMinutes) }}
            <span class="label-hint">({{ subtasks.length }} subtask{{ subtasks.length === 1 ? '' : 's' }})</span>
          </p>
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
          <label>Priority</label>
          <div class="pill-row">
            <button
              v-for="p in PRIORITIES"
              :key="p"
              type="button"
              class="pill priority-pill"
              :class="{ active: form.priority === p }"
              @click="form.priority = p"
            >
              <span class="priority-dot" :class="'priority-' + p"></span>
              {{ PRIORITY_LABELS[p] }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>Tags</label>
          <div class="tag-chips">
            <span v-for="tag in selectedTags" :key="tag.id" class="tag-chip">
              <span class="tag-chip-swatch" :style="{ background: tag.color || 'var(--color-border)' }"></span>
              {{ tag.name }}
              <button type="button" class="tag-chip-remove" aria-label="Remove tag" @click="removeTagId(tag.id)">
                <X :size="10" />
              </button>
            </span>
            <button type="button" class="tag-add-btn" @click="showTagPicker = !showTagPicker">
              <Plus :size="12" /> Add tag
            </button>
          </div>
          <div v-if="showTagPicker" class="tag-picker-panel">
            <input
              v-model="tagSearch"
              type="text"
              placeholder="Search or create tag..."
              class="tag-search"
              @keydown.escape.stop="showTagPicker = false"
            />
            <ul class="tag-picker-list">
              <li v-for="t in eligibleTags" :key="t.id">
                <button type="button" class="tag-picker-option" @click="addTagId(t.id)">
                  <span class="tag-chip-swatch" :style="{ background: t.color || 'var(--color-border)' }"></span>
                  {{ t.name }}
                </button>
              </li>
              <li v-if="tagSearch.trim() && !tagExactMatchExists">
                <button type="button" class="tag-picker-option tag-picker-create" :disabled="creatingTag" @click="createAndAddTag">
                  <Plus :size="12" /> Create "{{ tagSearch.trim() }}"
                </button>
              </li>
              <li v-if="eligibleTags.length === 0 && !tagSearch.trim()" class="tag-picker-empty">No more tags to add.</li>
            </ul>
            <p v-if="tagCreateError" class="error-msg">{{ tagCreateError }}</p>
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

        <div v-if="isEdit && isGroup" class="field subtasks-field">
          <label>Subtasks</label>

          <ul v-if="subtasks.length > 0" class="subtask-list">
            <li v-for="t in subtasks" :key="t.id" class="subtask-row">
              <span class="subtask-name" :title="t.name">#{{ t.id }} - {{ t.name }}</span>
              <span class="subtask-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
              <button
                type="button"
                class="subtask-remove"
                title="Remove from this group"
                aria-label="Remove from this group"
                :disabled="subtaskActionBusy"
                @click="removeSubtask(t)"
              >
                <X :size="12" />
              </button>
            </li>
          </ul>
          <p v-else class="label-hint no-subtasks">No subtasks yet.</p>

          <p v-if="subtaskActionError" class="error-msg">{{ subtaskActionError }}</p>

          <div class="subtask-actions">
            <button type="button" class="subtask-action-btn" @click="showCreateSubtask = true">
              <Plus :size="13" /> Create new subtask
            </button>
            <button type="button" class="subtask-action-btn" @click="showAddExisting = !showAddExisting">
              <component :is="showAddExisting ? ChevronUp : ChevronDown" :size="13" /> Add existing task
            </button>
          </div>

          <div v-if="showAddExisting" class="add-existing-panel">
            <input
              v-model="addExistingSearch"
              type="text"
              placeholder="Search tasks..."
              class="add-existing-search"
              @keydown.escape.stop="showAddExisting = false"
            />
            <ul class="add-existing-list">
              <li v-if="eligibleExistingTasks.length === 0" class="add-existing-empty">No matching tasks.</li>
              <li v-for="t in eligibleExistingTasks" :key="t.id">
                <button
                  type="button"
                  class="add-existing-option"
                  :disabled="subtaskActionBusy"
                  @click="addExistingSubtask(t)"
                >
                  <span class="subtask-name">#{{ t.id }} - {{ t.name }}</span>
                  <span class="subtask-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
                </button>
              </li>
            </ul>
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

  <TaskFormModal
    v-if="showCreateSubtask"
    :task="null"
    :disable-group-type="true"
    :saving="subtaskActionBusy"
    @close="showCreateSubtask = false"
    @submit="handleCreateSubtaskSubmit"
  />

  <ChoiceDialog
    v-if="pendingRelink"
    title="Task already linked to a planner entry"
    :message="`'${pendingRelink.task.name}' is linked to ${pendingRelink.entries.length > 1 ? 'planner entries' : 'a planner entry'}. Move it into this group and re-link ${pendingRelink.entries.length > 1 ? 'those entries' : 'that entry'} to the group instead?`"
    :actions="[{ value: 'relink', label: 'Move & re-link', variant: 'default' }]"
    @choose="confirmRelink"
    @close="cancelRelink"
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
  font-size: 0.78rem;
}

.type-readonly {
  font-size: 0.9rem;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.group-total {
  font-size: 0.9rem;
  color: var(--color-text);
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s,
    background-color 0.16s;
}

.pill:hover {
  color: var(--color-heading);
  border-color: #3b82f6;
}

.pill.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #3b82f6;
}

.priority-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.priority-dot.priority-None {
  background: var(--color-text);
  opacity: 0.4;
}

.priority-dot.priority-Low {
  background: #3b82f6;
}

.priority-dot.priority-Medium {
  background: #d97706;
}

.priority-dot.priority-High {
  background: #dc2626;
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

.subtasks-field {
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border);
}

.subtask-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}

.subtask-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
}

.subtask-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.83rem;
  color: var(--color-text);
}

.subtask-minutes {
  flex: none;
  font-size: 0.78rem;
  color: var(--color-text);
  opacity: 0.7;
}

.subtask-remove {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text);
  opacity: 0.6;
  cursor: pointer;
}

.subtask-remove:hover {
  opacity: 1;
  color: #dc2626;
}

.no-subtasks {
  margin-bottom: 0.5rem;
}

.subtask-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.subtask-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-heading);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.subtask-action-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.add-existing-panel {
  margin-top: 0.6rem;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.add-existing-search {
  width: 100%;
  margin-bottom: 0.4rem;
}

.add-existing-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 9rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.add-existing-empty {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.6;
  padding: 0.3rem;
}

.add-existing-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.83rem;
  text-align: left;
  cursor: pointer;
}

.add-existing-option:hover {
  background: var(--color-background);
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.78rem;
}

.tag-chip-swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tag-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text);
  opacity: 0.6;
  cursor: pointer;
  padding: 0;
}

.tag-chip-remove:hover {
  opacity: 1;
  color: #dc2626;
}

.tag-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.tag-add-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.tag-picker-panel {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.tag-search {
  width: 100%;
  margin-bottom: 0.4rem;
}

.tag-picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 9rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tag-picker-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.83rem;
  text-align: left;
  cursor: pointer;
}

.tag-picker-option:hover {
  background: var(--color-background);
}

.tag-picker-option.tag-picker-create {
  color: #3b82f6;
  font-weight: 600;
}

.tag-picker-option:disabled {
  opacity: 0.5;
  cursor: default;
}

.tag-picker-empty {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.6;
  padding: 0.3rem;
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
