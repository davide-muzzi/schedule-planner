<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SlidersHorizontal, X } from '@lucide/vue'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import { formatHours } from '@/utils/date'
import { buildTaskFilterCategories, defaultTaskFilters, taskMatchesFilters } from '@/utils/taskFilters'
import TaskFilterModal from './TaskFilterModal.vue'
import ChoiceDialog from './ChoiceDialog.vue'

const props = defineProps({
  // The Group these picked tasks will join - only its id/status matter here.
  groupTask: { type: Object, required: true },
})

const emit = defineEmits(['close', 'applied'])

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const scheduleStore = useScheduleStore()

const search = ref('')
const selectedIds = ref(new Set())
const busy = ref(false)
const error = ref(null)

const showFilterModal = ref(false)
const filterCategories = computed(() => buildTaskFilterCategories(tagsStore.tags))
const filters = ref(defaultTaskFilters(filterCategories.value))
const activeFilterCount = computed(
  () =>
    filterCategories.value.filter((c) => {
      const v = filters.value[c.key]
      return c.multiSelect ? Array.isArray(v) && v.length > 0 : (v ?? 'all') !== 'all'
    }).length,
)

// Plain, unattached tasks only - a Group can't itself become a subtask, and
// anything already in a group needs removing from there first.
const eligibleTasks = computed(() =>
  tasksStore.tasks.filter((t) => t.id !== props.groupTask.id && t.taskType !== 'Group' && t.parentTaskId == null),
)

const filteredTasks = computed(() =>
  eligibleTasks.value.filter((t) => taskMatchesFilters(t, filters.value, search.value)),
)

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

function tagIdsOf(task) {
  return (task.tags || []).map((t) => t.id)
}

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

// A subtask has no status of its own - it mirrors its group's, except an
// already-Done task stays Done. Mirrors TaskFormModal's own subtaskJoinStatus.
function joinStatus(task) {
  if (task.status === 'Done') return 'Done'
  return props.groupTask.status === 'Done' ? 'Backlog' : props.groupTask.status
}

const pendingRelink = ref(null) // { tasks, linkedCount } while the relink confirm is open

async function handleDone() {
  const selected = eligibleTasks.value.filter((t) => selectedIds.value.has(t.id))
  if (selected.length === 0) {
    emit('close')
    return
  }
  const linkedCount = selected.filter((t) => scheduleStore.entries.some((e) => e.taskItemId === t.id)).length
  if (linkedCount > 0) {
    pendingRelink.value = { tasks: selected, linkedCount }
    return
  }
  await commitSelection(selected)
}

async function commitSelection(tasks) {
  busy.value = true
  error.value = null
  try {
    for (const task of tasks) {
      const entries = scheduleStore.entries.filter((e) => e.taskItemId === task.id)
      for (const entry of entries) {
        await scheduleStore.updateEntry(entry.id, { ...entry, taskItemId: props.groupTask.id })
      }
      await tasksStore.updateTask(
        task.id,
        subtaskUpdatePayload(task, { parentTaskId: props.groupTask.id, status: joinStatus(task) }),
      )
    }
    emit('applied')
    emit('close')
  } catch {
    error.value = tasksStore.error || scheduleStore.error
  } finally {
    busy.value = false
  }
}

async function confirmRelink() {
  const { tasks } = pendingRelink.value
  pendingRelink.value = null
  await commitSelection(tasks)
}

function cancelRelink() {
  pendingRelink.value = null
}

function handleKeydown(event) {
  // The filter/relink-confirm dialogs have their own Escape handling.
  if (showFilterModal.value || pendingRelink.value) return
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

let mouseDownOnOverlay = false
function handleOverlayMouseDown(event) {
  mouseDownOnOverlay = event.target === event.currentTarget
}
function handleOverlayClick(event) {
  if (mouseDownOnOverlay && event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
      <div class="modal">
        <header class="modal-header">
          <h2>Add existing tasks</h2>
          <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
        </header>

        <div class="picker-toolbar">
          <input v-model="search" type="text" placeholder="Search tasks..." class="picker-search" />
          <button
            type="button"
            class="picker-filter-btn"
            :class="{ active: activeFilterCount > 0 }"
            @click="showFilterModal = true"
          >
            <SlidersHorizontal :size="13" /> Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span>
          </button>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <ul class="picker-list">
          <li v-if="filteredTasks.length === 0" class="picker-empty">No matching tasks.</li>
          <li v-for="t in filteredTasks" :key="t.id">
            <label class="picker-option" :class="{ selected: selectedIds.has(t.id) }">
              <input type="checkbox" :checked="selectedIds.has(t.id)" @change="toggleSelect(t.id)" />
              <span class="picker-name">#{{ t.id }} - {{ t.name }}</span>
              <span class="picker-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
            </label>
          </li>
        </ul>

        <footer class="modal-footer">
          <span class="picker-selected-count">{{ selectedIds.size }} selected</span>
          <div class="spacer"></div>
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
          <button type="button" class="save-btn" :disabled="busy" @click="handleDone">
            {{ busy ? 'Adding…' : 'Done' }}
          </button>
        </footer>
      </div>
    </div>

    <TaskFilterModal
      v-if="showFilterModal"
      :categories="filterCategories"
      :model-value="filters"
      @update:model-value="(v) => (filters = v)"
      @close="showFilterModal = false"
    />

    <ChoiceDialog
      v-if="pendingRelink"
      title="Some tasks are linked to planner entries"
      :message="`${pendingRelink.linkedCount} of your ${pendingRelink.tasks.length} selected task${pendingRelink.tasks.length === 1 ? '' : 's'} ${pendingRelink.linkedCount === 1 ? 'is' : 'are'} linked to a planner entry. Move ${pendingRelink.linkedCount === 1 ? 'it' : 'them'} into this group and re-link ${pendingRelink.linkedCount === 1 ? 'that entry' : 'those entries'} too?`"
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
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 28rem;
  max-height: 85vh;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex: none;
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

.picker-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex: none;
}

.picker-search {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.picker-filter-btn {
  display: flex;
  align-items: center;
  flex: none;
  gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.picker-filter-btn:hover {
  color: var(--color-heading);
  border-color: var(--accent);
}

.picker-filter-btn.active {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
}

.error-msg {
  color: #dc2626;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  flex: none;
}

.picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.picker-empty {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.6;
  padding: 0.3rem;
}

.picker-option {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.83rem;
  text-align: left;
  cursor: pointer;
}

.picker-option:hover {
  background: var(--color-background-soft);
}

.picker-option.selected {
  background: var(--accent-tint);
  color: var(--color-heading);
}

.picker-option input[type='checkbox'] {
  flex: none;
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
  cursor: pointer;
}

.picker-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.picker-minutes {
  flex: none;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  opacity: 0.75;
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1rem;
  flex: none;
}

.picker-selected-count {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.75;
}

.spacer {
  flex: 1;
}

.modal-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  font-family: inherit;
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
</style>
