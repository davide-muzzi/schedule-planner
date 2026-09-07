<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, X, SlidersHorizontal, Tags } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import { useAppShell } from '@/composables/useAppShell'
import { realMinutesForTask, plannedMinutesForGroup, subtasksOf } from '@/utils/taskStats'
import { taskDiffStatus } from '@/utils/status'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'
import TaskFilterModal from '@/components/TaskFilterModal.vue'
import TaskCard from '@/components/TaskCard.vue'
import ChoiceDialog from '@/components/ChoiceDialog.vue'
import TagManageModal from '@/components/TagManageModal.vue'

const STATUS_LABELS = { Backlog: 'Backlog', Planned: 'Planned', InProgress: 'In Progress', Done: 'Done' }

// Grouping order applied when no status filter is active - In Progress work
// surfaces first, then what's still queued up, with Done sinking to the
// bottom regardless of the current sort field.
const STATUS_GROUP_ORDER = { InProgress: 0, Planned: 1, Backlog: 2, Done: 3 }

const SORT_OPTIONS = [
  { value: 'id', label: 'ID' },
  { value: 'name', label: 'Alphabetical' },
  { value: 'dueDate', label: 'Due date' },
]
const SORT_STORAGE_KEY = 'schedulePlanner.taskSortBy'

// Each category is single-select with an "all" option meaning that category
// imposes no restriction - a task only has to clear every category to show.
// Adding a new filterable attribute later is just another entry here, not a
// rework of the filter UI itself. Status/Priority are fixed; Tags is
// data-driven (see FILTER_CATEGORIES below), since the tag catalog changes
// at runtime.
const BASE_FILTER_CATEGORIES = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'Backlog', label: STATUS_LABELS.Backlog },
      { value: 'Planned', label: STATUS_LABELS.Planned },
      { value: 'InProgress', label: STATUS_LABELS.InProgress },
      { value: 'Done', label: STATUS_LABELS.Done },
    ],
  },
  {
    key: 'priority',
    label: 'Priority',
    options: [
      { value: 'all', label: 'All' },
      { value: 'None', label: 'None' },
      { value: 'Low', label: 'Low' },
      { value: 'Medium', label: 'Medium' },
      { value: 'High', label: 'High' },
    ],
  },
]
const FILTERS_STORAGE_KEY = 'schedulePlanner.taskFilters'

function loadSortBy() {
  const stored = localStorage.getItem(SORT_STORAGE_KEY)
  return SORT_OPTIONS.some((o) => o.value === stored) ? stored : 'id'
}

const scheduleStore = useScheduleStore()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const { isNarrowViewport } = useAppShell()

const FILTER_CATEGORIES = computed(() => [
  ...BASE_FILTER_CATEGORIES,
  {
    key: 'tags',
    label: 'Tags',
    options: [
      { value: 'all', label: 'All' },
      ...tagsStore.tags.map((t) => ({ value: String(t.id), label: t.name })),
    ],
  },
])

function loadFiltersFrom(categories, existing = {}) {
  let stored
  try {
    stored = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY))
  } catch {
    stored = null
  }
  const result = { ...existing }
  for (const category of categories) {
    if (category.key in result) continue
    if (stored && typeof stored === 'object' && category.options.some((o) => o.value === stored[category.key])) {
      result[category.key] = stored[category.key]
    } else {
      result[category.key] = 'all'
    }
  }
  return result
}

const sortBy = ref(loadSortBy())
watch(sortBy, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

const filters = ref(loadFiltersFrom(FILTER_CATEGORIES.value))
watch(filters, (value) => localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(value)), { deep: true })

// The Tags category's options only exist once tagsStore.tags has loaded -
// this backfills a default (or a validated restored value) for any
// category not yet present in `filters` once it shows up, without
// disturbing categories already set.
watch(FILTER_CATEGORIES, (categories) => {
  filters.value = loadFiltersFrom(categories, filters.value)
})

const showFilterModal = ref(false)
const showTagManageModal = ref(false)
const activeFilterCount = computed(
  () => FILTER_CATEGORIES.value.filter((c) => (filters.value[c.key] ?? 'all') !== 'all').length,
)

// Staggers each card's entrance by its position in the first non-empty task
// list this view sees, captured once - same reasoning as DayTable's own
// entry stagger: a task created afterward (or a filter/sort change
// reshuffling what's visible) shouldn't replay the cascade for every
// existing card, so anything outside that captured set just gets 0ms.
const STAGGER_STEP_MS = 40
const STAGGER_MAX_MS = 400
const initialTaskOrder = ref(new Map())
let capturedInitialOrder = false

watch(
  () => tasksStore.tasks,
  (tasks) => {
    if (capturedInitialOrder || tasks.length === 0) return
    capturedInitialOrder = true
    const visibleIds = tasks.filter((t) => t.parentTaskId == null).map((t) => t.id)
    initialTaskOrder.value = new Map(visibleIds.map((id, i) => [id, i]))
  },
  { immediate: true },
)

function taskCardDelay(task) {
  const idx = initialTaskOrder.value.get(task.id)
  if (idx === undefined) return '0ms'
  return `${Math.min(idx * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`
}

// Entries/tasks are already loaded app-wide (see App.vue) - this just
// re-checks the auto Open -> In Progress transition in case an entry's
// start time has passed since app load, while the user was on another page.
onMounted(() => {
  tasksStore.syncAutoStatuses(scheduleStore.entries)
})

function taskCard(task) {
  const isGroup = task.taskType === 'Group'
  // A Group's own estimatedMinutes is never meaningful (always 0 in the
  // backend) - its "Planned" is always the live sum of its subtasks instead.
  const estimatedMinutes = isGroup ? plannedMinutesForGroup(tasksStore.tasks, task.id) : task.estimatedMinutes
  const realMinutes = Math.round(realMinutesForTask(scheduleStore.entries, task.id))
  const diffMinutes = realMinutes - estimatedMinutes
  return {
    ...task,
    estimatedMinutes,
    realMinutes,
    diffMinutes,
    // No diff color (or diff claim at all - see formatDiff) until some real
    // time has actually been logged - otherwise every fresh task would show
    // a misleading "-2h, on target" derived purely from the negative of its
    // own estimate.
    diffStatus: realMinutes === 0 ? null : taskDiffStatus(diffMinutes),
    subtasks: isGroup ? subtasksOf(tasksStore.tasks, task.id) : [],
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
  const f = filters.value
  if ((f.status ?? 'all') !== 'all' && task.status !== f.status) return false
  if ((f.priority ?? 'all') !== 'all' && task.priority !== f.priority) return false
  if ((f.tags ?? 'all') !== 'all' && !(task.tags || []).some((t) => String(t.id) === f.tags)) return false
  return true
}

// Subtasks never appear as their own top-level cards - they render nested
// inside their Group's card instead (see TaskCard's subtask-preview).
const taskCards = computed(() =>
  tasksStore.tasks
    .filter((t) => t.parentTaskId == null)
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

function taskUpdatePayload(task, overrides) {
  return {
    name: task.name,
    // A Group's estimatedMinutes is never set directly - see taskCard().
    estimatedMinutes: task.taskType === 'Group' ? 0 : task.estimatedMinutes,
    status: task.status,
    priority: task.priority ?? 'None',
    taskType: task.taskType,
    parentTaskId: task.parentTaskId ?? null,
    tagIds: (task.tags || []).map((t) => t.id),
    color: task.color ?? null,
    dueDate: task.dueDate ?? null,
    notes: task.notes ?? null,
    ...overrides,
  }
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

const pendingGroupDelete = ref(null)

// Groups with subtasks need a cascade-or-unlink choice before deleting -
// everything else (plain tasks, or an empty Group) deletes immediately with
// the usual undo toast.
function requestDelete(id) {
  const task = tasksStore.tasks.find((t) => t.id === id)
  const hasSubtasks = task?.taskType === 'Group' && tasksStore.tasks.some((t) => t.parentTaskId === id)
  if (hasSubtasks) {
    pendingGroupDelete.value = task
    return
  }
  handleDelete(id)
}

function handleGroupDeleteChoice(choice) {
  const task = pendingGroupDelete.value
  pendingGroupDelete.value = null
  handleDelete(task.id, choice === 'cascade')
}

async function handleDelete(id, cascadeSubtasks = false) {
  saving.value = true
  const task = tasksStore.tasks.find((t) => t.id === id)
  const hadSubtasks = task?.taskType === 'Group' && tasksStore.tasks.some((t) => t.parentTaskId === id)
  try {
    await tasksStore.deleteTask(id, cascadeSubtasks)
    closeModal()
    if (task && !hadSubtasks) {
      showToast('Task deleted.', {
        variant: 'error',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await tasksStore.createTask(taskUpdatePayload(task))
          } catch {
            showToast("Couldn't restore that task.")
          }
        },
      })
    } else if (task) {
      showToast(
        cascadeSubtasks ? 'Group and its subtasks deleted.' : 'Group deleted - subtasks kept as standalone tasks.',
      )
    }
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

function handleQuickDelete(task, event) {
  event.stopPropagation()
  requestDelete(task.id)
}

async function handleQuickComplete(task, event) {
  event.stopPropagation()
  saving.value = true
  try {
    await tasksStore.updateTask(task.id, taskUpdatePayload(task, { status: 'Done' }))
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
        <button type="button" class="filter-btn" @click="showTagManageModal = true">
          <Tags :size="14" /> Manage tags
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
            :subtasks="task.subtasks"
            :status-label="STATUS_LABELS[task.status]"
            :is-narrow-viewport="isNarrowViewport"
            :style="{ animationDelay: taskCardDelay(task) }"
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
      @delete="requestDelete"
    />

    <TaskFilterModal
      v-if="showFilterModal"
      :categories="FILTER_CATEGORIES"
      :model-value="filters"
      @update:model-value="(v) => (filters = v)"
      @close="showFilterModal = false"
    />

    <ChoiceDialog
      v-if="pendingGroupDelete"
      title="Delete group"
      :message="`'${pendingGroupDelete.name}' has subtasks. Delete them too, or keep them as standalone tasks?`"
      :actions="[
        { value: 'unlink', label: 'Keep subtasks', variant: 'default' },
        { value: 'cascade', label: 'Delete subtasks too', variant: 'danger' },
      ]"
      @choose="handleGroupDeleteChoice"
      @close="pendingGroupDelete = null"
    />

    <TagManageModal v-if="showTagManageModal" @close="showTagManageModal = false" />
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
