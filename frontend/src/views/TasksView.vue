<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, X, SlidersHorizontal } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAppShell } from '@/composables/useAppShell'
import { realMinutesForTask } from '@/utils/taskStats'
import { taskDiffStatus } from '@/utils/status'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'
import TaskFilterModal from '@/components/TaskFilterModal.vue'
import TaskCard from '@/components/TaskCard.vue'

const STATUS_LABELS = { Open: 'Not started', InProgress: 'In Progress', Done: 'Done' }

// Grouping order applied when no status filter is active - In Progress work
// surfaces first, then what's still queued up, with Done sinking to the
// bottom regardless of the current sort field.
const STATUS_GROUP_ORDER = { InProgress: 0, Open: 1, Done: 2 }

const SORT_OPTIONS = [
  { value: 'id', label: 'ID' },
  { value: 'name', label: 'Alphabetical' },
  { value: 'dueDate', label: 'Due date' },
]
const SORT_STORAGE_KEY = 'schedulePlanner.taskSortBy'

// Each category is single-select with an "all" option meaning that category
// imposes no restriction - a task only has to clear every category to show.
// Adding a new filterable attribute later (e.g. Important) is just another
// entry here, not a rework of the filter UI itself.
const FILTER_CATEGORIES = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'Open', label: STATUS_LABELS.Open },
      { value: 'InProgress', label: STATUS_LABELS.InProgress },
      { value: 'Done', label: STATUS_LABELS.Done },
    ],
  },
  {
    key: 'important',
    label: 'Important',
    options: [
      { value: 'all', label: 'All' },
      { value: 'true', label: 'Important' },
      { value: 'false', label: 'Not important' },
    ],
  },
]
const FILTERS_STORAGE_KEY = 'schedulePlanner.taskFilters'

function defaultFilters() {
  return Object.fromEntries(FILTER_CATEGORIES.map((c) => [c.key, 'all']))
}

function loadFilters() {
  const filters = defaultFilters()
  let stored
  try {
    stored = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY))
  } catch {
    stored = null
  }
  if (stored && typeof stored === 'object') {
    for (const category of FILTER_CATEGORIES) {
      if (category.options.some((o) => o.value === stored[category.key])) {
        filters[category.key] = stored[category.key]
      }
    }
  }
  return filters
}

function loadSortBy() {
  const stored = localStorage.getItem(SORT_STORAGE_KEY)
  return SORT_OPTIONS.some((o) => o.value === stored) ? stored : 'id'
}

const scheduleStore = useScheduleStore()
const tasksStore = useTasksStore()
const { isNarrowViewport } = useAppShell()

const sortBy = ref(loadSortBy())
watch(sortBy, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

const filters = ref(loadFilters())
watch(filters, (value) => localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(value)), { deep: true })
const showFilterModal = ref(false)
const activeFilterCount = computed(() => FILTER_CATEGORIES.filter((c) => filters.value[c.key] !== 'all').length)

// Entries/tasks are already loaded app-wide (see App.vue) - this just
// re-checks the auto Open -> In Progress transition in case an entry's
// start time has passed since app load, while the user was on another page.
onMounted(() => {
  tasksStore.syncAutoStatuses(scheduleStore.entries)
})

function taskCard(task) {
  const realMinutes = Math.round(realMinutesForTask(scheduleStore.entries, task.id))
  const diffMinutes = realMinutes - task.estimatedMinutes
  return {
    ...task,
    realMinutes,
    diffMinutes,
    // No diff color (or diff claim at all - see formatDiff) until some real
    // time has actually been logged - otherwise every fresh task would show
    // a misleading "-2h, on target" derived purely from the negative of its
    // own estimate.
    diffStatus: realMinutes === 0 ? null : taskDiffStatus(diffMinutes),
  }
}

// All three orderings are ascending, per-field, with id as the tiebreaker.
// dueDate is a "YYYY-MM-DD" string (or null) - plain string comparison
// already sorts it chronologically; tasks with no due date always sort
// after every dated one, regardless of which field is active.
function compareTasks(a, b) {
  // Only groups by status when no single status is already filtered down to
  // - with one status showing, every card shares the same group, so this
  // would just be a no-op ahead of the real sort field.
  if (filters.value.status === 'all') {
    const groupDiff = STATUS_GROUP_ORDER[a.status] - STATUS_GROUP_ORDER[b.status]
    if (groupDiff !== 0) return groupDiff
  }
  if (sortBy.value === 'name') return a.name.localeCompare(b.name) || a.id - b.id
  if (sortBy.value === 'dueDate') {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || a.id - b.id
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.id - b.id
  }
  return a.id - b.id
}

function matchesFilters(task) {
  if (filters.value.status !== 'all' && task.status !== filters.value.status) return false
  if (filters.value.important !== 'all' && String(!!task.isImportant) !== filters.value.important) return false
  return true
}

const taskCards = computed(() =>
  tasksStore.tasks
    .filter(matchesFilters)
    .map(taskCard)
    .sort(compareTasks),
)

// Splits the already-grouped-by-status list into labeled sections for
// display, one per status boundary. Only done when the status filter is off
// - with a single status already isolated, every card would land in one
// section and the header would be redundant.
const taskSections = computed(() => {
  if (filters.value.status !== 'all') {
    return [{ status: null, tasks: taskCards.value }]
  }
  const sections = []
  for (const task of taskCards.value) {
    const current = sections[sections.length - 1]
    if (current && current.status === task.status) {
      current.tasks.push(task)
    } else {
      sections.push({ status: task.status, tasks: [task] })
    }
  }
  return sections
})

const showModal = ref(false)
const editingTask = ref(null)
const modalError = ref(null)
const saving = ref(false)

function openAdd() {
  editingTask.value = null
  modalError.value = null
  showModal.value = true
}

function openEdit(task) {
  editingTask.value = task
  modalError.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingTask.value = null
  modalError.value = null
}

async function handleSubmit(payload) {
  saving.value = true
  modalError.value = null
  try {
    if (editingTask.value) {
      await tasksStore.updateTask(editingTask.value.id, payload)
    } else {
      await tasksStore.createTask(payload)
    }
    closeModal()
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

async function handleDelete(id) {
  saving.value = true
  const task = tasksStore.tasks.find((t) => t.id === id)
  try {
    await tasksStore.deleteTask(id)
    closeModal()
    if (task) {
      showToast('Task deleted.', {
        variant: 'error',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await tasksStore.createTask({
              name: task.name,
              estimatedMinutes: task.estimatedMinutes,
              status: task.status,
              isImportant: task.isImportant ?? false,
              color: task.color ?? null,
              dueDate: task.dueDate ?? null,
              notes: task.notes ?? null,
            })
          } catch {
            showToast("Couldn't restore that task.")
          }
        },
      })
    }
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

async function handleQuickDelete(task, event) {
  event.stopPropagation()
  await handleDelete(task.id)
}

async function handleQuickComplete(task, event) {
  event.stopPropagation()
  saving.value = true
  try {
    await tasksStore.updateTask(task.id, {
      name: task.name,
      estimatedMinutes: task.estimatedMinutes,
      status: 'Done',
      isImportant: task.isImportant ?? false,
      color: task.color ?? null,
      dueDate: task.dueDate ?? null,
      notes: task.notes ?? null,
    })
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="page">
    <div class="tasks-header">
      <div class="header-title">
        <p class="kicker">To-do</p>
        <h1 class="title">Tasks</h1>
      </div>
      <div class="header-actions">
        <button type="button" class="filter-btn" :class="{ active: activeFilterCount > 0 }" @click="showFilterModal = true">
          <SlidersHorizontal :size="14" /> Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span>
        </button>
        <label class="sort-control">
          Sort by
          <select v-model="sortBy">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <button type="button" class="add-btn" @click="openAdd"><Plus :size="14" /> New Task</button>
      </div>
    </div>

    <div v-if="tasksStore.error && !showModal" class="global-error">
      {{ tasksStore.error }}
      <button type="button" @click="tasksStore.clearError()"><X :size="16" /></button>
    </div>

    <p v-if="tasksStore.loading" class="loading">Loading…</p>

    <p v-else-if="taskCards.length === 0 && activeFilterCount > 0" class="empty-state">
      No tasks match this filter.
    </p>

    <p v-else-if="taskCards.length === 0" class="empty-state">
      No tasks yet. Add one to start tracking estimated vs. real time.
    </p>

    <div v-else class="task-sections">
      <div v-for="section in taskSections" :key="section.status ?? 'flat'" class="task-section">
        <div v-if="section.status" class="section-header">
          <span class="section-label">{{ STATUS_LABELS[section.status] }}</span>
          <span class="section-count">{{ section.tasks.length }}</span>
        </div>
        <div class="task-grid">
          <TaskCard
            v-for="task in section.tasks"
            :key="task.id"
            :task="task"
            :status-label="STATUS_LABELS[task.status]"
            :is-narrow-viewport="isNarrowViewport"
            @edit="openEdit(task)"
            @quick-complete="handleQuickComplete(task, $event)"
            @quick-delete="handleQuickDelete(task, $event)"
          />
        </div>
      </div>
    </div>

    <TaskFormModal
      v-if="showModal"
      :task="editingTask"
      :server-error="modalError"
      :saving="saving"
      @close="closeModal"
      @submit="handleSubmit"
      @delete="handleDelete"
    />

    <TaskFilterModal
      v-if="showFilterModal"
      :categories="FILTER_CATEGORIES"
      :model-value="filters"
      @update:model-value="(v) => (filters = v)"
      @close="showFilterModal = false"
    />
  </section>
</template>

<style scoped>
.page {
  animation: fadeUp 0.34s var(--ease) both;
}

.tasks-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 1.4rem;
  margin-bottom: 1.6rem;
  border-bottom: 1px solid var(--line-2);
}

.kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.title {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--fg);
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.filter-btn:hover {
  border-color: var(--accent);
}

.filter-btn.active {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mute);
  white-space: nowrap;
}

.sort-control select {
  padding: 6px 8px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--r);
  border: 1px solid var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.add-btn:hover {
  filter: brightness(1.1);
}

.loading,
.empty-state {
  color: var(--mute);
  font-size: 0.9rem;
}

.global-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--bad) 15%, transparent);
  color: var(--bad);
  border: 1px solid var(--bad);
  padding: 0.6rem 0.9rem;
  border-radius: var(--r2);
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.global-error button {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
}

.task-sections {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line-2);
}

.section-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--dim);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.section-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--mute);
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

@media (max-width: 900px) {
  .task-grid {
    grid-template-columns: 1fr;
  }
}
</style>
