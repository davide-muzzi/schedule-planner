<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X, Plus, ListPlus } from '@lucide/vue'
import { useAppShell } from '@/composables/useAppShell'
import { useFloatingMenu } from '@/composables/useFloatingMenu'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import { formatHours } from '@/utils/date'
import ChoiceDialog from './ChoiceDialog.vue'
import TimePartInput from './TimePartInput.vue'
import SubtaskPickerModal from './SubtaskPickerModal.vue'

const { isNarrowViewport } = useAppShell()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }
const PRIORITIES = ['None', 'Low', 'Medium', 'High']
const PRIORITY_LABELS = { None: 'None', Low: 'Low', Medium: 'Medium', High: 'High' }
const DEFAULT_COLOR = '#3b82f6'
const ESTIMATE_HOUR_OPTIONS = ['00', '01', '02', '03', '04', '05']
const ESTIMATE_MINUTE_OPTIONS = ['00', '15', '30', '45']

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
    // Kept as the same padded 2-digit strings TimePartInput itself works in
    // (see its v-model usage below) rather than numbers, so nothing has to
    // re-pad on every keystroke and fight the field mid-typing - only
    // coerced back to a number at submit time.
    estimatedHours: String(Math.floor(minutes / 60)).padStart(2, '0'),
    estimatedMinutes: String(minutes % 60).padStart(2, '0'),
    status: 'Backlog',
    priority: 'None',
    tagIds: [],
    // 'none' | 'firstTag' | 'custom' - there's no backend field remembering
    // which of these was picked (Color is just a plain "#rrggbb" string or
    // null), so 'firstTag' is a one-time snapshot resolved at save time, not
    // a live link - reopening an existing task infers the radio from whether
    // its stored color still matches its first colored tag (see the
    // props.task watcher below), rather than always falling back to 'custom'.
    colorMode: 'none',
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
      // Still just a heuristic (Color is only ever a plain hex string, see
      // blankForm's comment above) - if a manually-picked custom color
      // happens to exactly match the first tag's color, this reads as
      // 'firstTag' rather than 'custom'. Harmless since the two render
      // identically, and it's the only way to tell them apart without a
      // dedicated backend field.
      const firstColoredTaskTag = (task.tags || []).find((t) => t.color)
      form.value = {
        name: task.name || '',
        taskType: task.taskType || 'Task',
        estimatedHours: String(Math.floor(task.estimatedMinutes / 60)).padStart(2, '0'),
        estimatedMinutes: String(task.estimatedMinutes % 60).padStart(2, '0'),
        status: task.status,
        priority: task.priority || 'None',
        tagIds: (task.tags || []).map((t) => t.id),
        colorMode: task.color ? (task.color === firstColoredTaskTag?.color ? 'firstTag' : 'custom') : 'none',
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

// The tag "First Tag's color" resolves to - the first of this task's tags
// (in the order they're attached) that actually has a color set, skipping
// any that don't. null when no attached tag has a color, which is also
// what disables that radio option.
const firstColoredTag = computed(() => selectedTags.value.find((t) => t.color) ?? null)

// If tags change in a way that invalidates the current 'firstTag' selection
// (last colored tag removed, etc.) don't leave a disabled option selected -
// fall back to no color rather than silently saving a stale choice.
watch(firstColoredTag, (tag) => {
  if (!tag && form.value.colorMode === 'firstTag') form.value.colorMode = 'none'
})

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
    color:
      form.value.colorMode === 'custom'
        ? form.value.color
        : form.value.colorMode === 'firstTag'
          ? (firstColoredTag.value?.color ?? null)
          : null,
    dueDate: form.value.dueDate || null,
    notes: form.value.notes.trim() || null,
  }

  emit('submit', payload)
}

function handleDeleteClick() {
  emit('delete', props.task.id)
}

// --- Subtask management (edit mode, Group only) ---

const showSubtaskPicker = ref(false)
const showCreateSubtask = ref(false)
const subtaskActionError = ref(null)
const subtaskActionBusy = ref(false)

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

// A subtask is never linked to a planner entry of its own - its
// Backlog/Ready/InProgress always mirrors its group's current status.
// Already-Done stays Done regardless of what the group is doing; joining a
// Done group starts a task at Backlog rather than inheriting Done.
function subtaskJoinStatus(task) {
  if (task.status === 'Done') return 'Done'
  return props.task.status === 'Done' ? 'Backlog' : props.task.status
}

function handleSubtasksPicked() {
  subtasksChanged.value = true
}

async function removeSubtask(task) {
  subtaskActionError.value = null
  subtaskActionBusy.value = true
  try {
    // No longer part of a group means no status to mirror - back to
    // Backlog, unless it was already independently Done.
    const status = task.status === 'Done' ? 'Done' : 'Backlog'
    await tasksStore.updateTask(task.id, subtaskUpdatePayload(task, { parentTaskId: null, status }))
    subtasksChanged.value = true
  } catch {
    subtaskActionError.value = tasksStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

// Removing a subtask from the group is ambiguous - keep it as its own
// standalone task, or delete it outright - so ask rather than assuming.
const pendingRemoveSubtask = ref(null)

function requestRemoveSubtask(task) {
  pendingRemoveSubtask.value = task
}

function cancelRemoveSubtask() {
  pendingRemoveSubtask.value = null
}

async function confirmRemoveSubtask(choice) {
  const task = pendingRemoveSubtask.value
  pendingRemoveSubtask.value = null
  if (choice === 'delete') {
    subtaskActionError.value = null
    subtaskActionBusy.value = true
    try {
      await tasksStore.deleteTask(task.id)
      subtasksChanged.value = true
    } catch {
      subtaskActionError.value = tasksStore.error
    } finally {
      subtaskActionBusy.value = false
    }
    return
  }
  await removeSubtask(task)
}

async function handleCreateSubtaskSubmit(payload) {
  subtaskActionBusy.value = true
  subtaskActionError.value = null
  try {
    const status = subtaskJoinStatus({ status: 'Backlog' })
    await tasksStore.createTask({ ...payload, taskType: 'Task', parentTaskId: props.task.id, status })
    subtasksChanged.value = true
    showCreateSubtask.value = false
  } catch {
    subtaskActionError.value = tasksStore.error
  } finally {
    subtaskActionBusy.value = false
  }
}

// --- Subtask priority quick-picker (edit mode, Group only) ---

const {
  openId: openSubtaskPriorityMenu,
  position: subtaskPriorityMenuPosition,
  setMenuEl: setSubtaskPriorityMenuEl,
  toggle: toggleSubtaskPriorityMenu,
  close: closeSubtaskPriorityMenu,
} = useFloatingMenu()

async function setSubtaskPriority(task, priority) {
  closeSubtaskPriorityMenu()
  if (task.priority === priority) return
  subtaskActionBusy.value = true
  subtaskActionError.value = null
  try {
    await tasksStore.updateTask(task.id, subtaskUpdatePayload(task, { priority }))
    subtasksChanged.value = true
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
  // The nested "Create new subtask" / relink-confirm / remove-subtask-confirm
  // dialogs have their own Escape/Enter handling - same reasoning as
  // EntryFormModal's guard.
  if (showCreateSubtask.value || showSubtaskPicker.value || pendingRemoveSubtask.value) return
  if (event.key === 'Escape') {
    if (openSubtaskPriorityMenu.value) {
      closeSubtaskPriorityMenu()
      return
    }
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
    <div class="modal" :class="{ 'modal-wide': isEdit && isGroup }">
      <header class="modal-header">
        <h2>{{ isEdit ? 'Edit task' : 'Add task' }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="form-columns">
        <div class="form-col-left">
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
          <p v-else class="type-readonly">{{ isGroup ? 'Group' : 'Task' }}</p>
          <p v-if="!isEdit" class="label-hint">
            {{ form.taskType === 'Group'
              ? "A Group holds subtasks - its planned time is their total, and it's what you link to a planner entry."
              : 'A standalone task with its own planned time.' }}
          </p>
        </div>

        <div v-if="!isGroup" class="field-row">
          <div class="field">
            <label>Est. h</label>
            <TimePartInput v-model="form.estimatedHours" :options="ESTIMATE_HOUR_OPTIONS" :max="99" />
          </div>
          <div class="field">
            <label>Est. min</label>
            <TimePartInput v-model="form.estimatedMinutes" :options="ESTIMATE_MINUTE_OPTIONS" :max="59" />
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
          <div v-if="isEdit" class="field">
            <label>Status</label>
            <p class="status-readonly">
              <span class="status-badge" :class="'badge-' + form.status">{{ STATUS_LABELS[form.status] }}</span>
            </p>
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
          <div class="color-mode-list">
            <label class="color-mode-row">
              <input v-model="form.colorMode" type="radio" value="none" />
              No color
            </label>
            <label class="color-mode-row" :class="{ disabled: !firstColoredTag }">
              <input v-model="form.colorMode" type="radio" value="firstTag" :disabled="!firstColoredTag" />
              First Tag's color
              <span v-if="firstColoredTag" class="color-mode-swatch" :style="{ background: firstColoredTag.color }"></span>
            </label>
            <label class="color-mode-row">
              <input v-model="form.colorMode" type="radio" value="custom" />
              Custom color
              <input
                v-model="form.color"
                type="color"
                class="color-input"
                :disabled="form.colorMode !== 'custom'"
                title="Shown as diagonal stripes on this task's timeline entries"
              />
            </label>
          </div>
        </div>

        </div>

        <div v-if="isEdit && isGroup" class="form-col-right">
        <div class="field subtasks-field">
          <label>Subtasks</label>

          <ul v-if="subtasks.length > 0" class="subtask-list">
            <li v-for="t in subtasks" :key="t.id" class="subtask-row">
              <span class="subtask-priority-wrap">
                <button
                  type="button"
                  class="priority-dot interactive-dot"
                  :class="'priority-' + t.priority"
                  :title="`${PRIORITY_LABELS[t.priority]} priority - click to change`"
                  :aria-label="`${PRIORITY_LABELS[t.priority]} priority - click to change`"
                  @click.stop="toggleSubtaskPriorityMenu(t.id, $event)"
                ></button>
                <Teleport to="body">
                  <div
                    v-if="openSubtaskPriorityMenu === t.id"
                    :ref="setSubtaskPriorityMenuEl"
                    class="priority-menu"
                    :style="{ top: subtaskPriorityMenuPosition.top + 'px', left: subtaskPriorityMenuPosition.left + 'px' }"
                  >
                    <button
                      v-for="p in PRIORITIES"
                      :key="p"
                      type="button"
                      class="priority-menu-option"
                      :class="{ active: t.priority === p }"
                      :disabled="subtaskActionBusy"
                      @click="setSubtaskPriority(t, p)"
                    >
                      <span class="priority-dot" :class="'priority-' + p"></span>
                      {{ PRIORITY_LABELS[p] }}
                    </button>
                  </div>
                </Teleport>
              </span>
              <span class="subtask-name" :title="t.name">#{{ t.id }} - {{ t.name }}</span>
              <span class="subtask-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
              <button
                type="button"
                class="subtask-remove"
                title="Remove from this group"
                aria-label="Remove from this group"
                :disabled="subtaskActionBusy"
                @click="requestRemoveSubtask(t)"
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
            <button type="button" class="subtask-action-btn" @click="showSubtaskPicker = true">
              <ListPlus :size="13" /> Add existing task
            </button>
          </div>
        </div>
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

  <SubtaskPickerModal
    v-if="showSubtaskPicker"
    :group-task="props.task"
    @applied="handleSubtasksPicked"
    @close="showSubtaskPicker = false"
  />

  <ChoiceDialog
    v-if="pendingRemoveSubtask"
    title="Remove subtask"
    :message="`Unlink '${pendingRemoveSubtask.name}' and keep it as a standalone task, or delete it entirely?`"
    :actions="[
      { value: 'unlink', label: 'Unlink', variant: 'default' },
      { value: 'delete', label: 'Delete entirely', variant: 'danger' },
    ]"
    @choose="confirmRemoveSubtask"
    @close="cancelRemoveSubtask"
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

/* A group's edit modal doubles in width so its Subtasks section can sit
   beside the rest of the form instead of stacking below it - the point is
   avoiding a long scroll when a group has a lot of subtasks. */
.modal-wide {
  max-width: 52rem;
}

.form-columns {
  display: flex;
  flex-direction: column;
}

.modal-wide .form-columns {
  display: grid;
  /* minmax(0, 1fr), not plain 1fr - a grid track otherwise refuses to
     shrink below its content's natural (unwrapped) width, which let a long
     subtask name stretch the whole right column - and with it the modal -
     wider instead of respecting .subtask-name's own ellipsis truncation. */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 2rem;
  align-items: start;
}

@media (max-width: 900px) {
  .modal-wide {
    max-width: 26rem;
  }

  .modal-wide .form-columns {
    display: flex;
    flex-direction: column;
  }
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

.color-mode-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-mode-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
  font-size: 0.9rem;
  color: var(--color-text);
  cursor: pointer;
}

.color-mode-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.color-mode-row input[type='radio'] {
  width: 1rem;
  height: 1rem;
  accent-color: #3b82f6;
  cursor: pointer;
}

.color-mode-row.disabled input[type='radio'] {
  cursor: not-allowed;
}

.color-mode-swatch {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 1px solid var(--color-border);
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

/* Side-by-side with the rest of the form (see .modal-wide) instead of
   stacked below it, so it gets its own scroll instead of stretching the
   whole modal taller than the left column. */
.modal-wide .form-col-right .subtasks-field {
  padding-top: 0;
  border-top: none;
  padding-left: 2rem;
  border-left: 1px solid var(--color-border);
  max-height: 75vh;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .modal-wide .form-col-right .subtasks-field {
    padding-top: 0.6rem;
    border-top: 1px solid var(--color-border);
    padding-left: 0;
    border-left: none;
    max-height: none;
    overflow-y: visible;
  }
}

.status-readonly {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}

.status-badge {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  color: var(--mute);
}

.status-badge.badge-Backlog {
  color: var(--mute);
  border-color: var(--line-2);
}

.status-badge.badge-Ready {
  color: var(--warn);
  border-color: var(--warn);
}

.status-badge.badge-InProgress {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-tint);
}

.status-badge.badge-Done {
  color: var(--ok);
  border-color: var(--ok);
}

.subtask-priority-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}

.priority-dot.interactive-dot {
  width: 9px;
  height: 9px;
  border: none;
  padding: 0;
  cursor: pointer;
}

.priority-dot.interactive-dot:hover {
  outline: 2px solid var(--color-border-hover);
  outline-offset: 2px;
}

.priority-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.3rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.priority-menu-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.78rem;
  white-space: nowrap;
  text-align: left;
  cursor: pointer;
}

.priority-menu-option:hover {
  background: var(--color-background-soft);
}

.priority-menu-option.active {
  color: var(--color-heading);
  font-weight: 600;
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
  justify-content: center;
  flex: 1 1 0;
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
