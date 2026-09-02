<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, X, CalendarDays, Check } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAppShell } from '@/composables/useAppShell'
import { formatHours } from '@/utils/date'
import { realMinutesForTask } from '@/utils/taskStats'
import { taskDiffStatus } from '@/utils/status'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'

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

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'Open', label: STATUS_LABELS.Open },
  { value: 'InProgress', label: STATUS_LABELS.InProgress },
  { value: 'Done', label: STATUS_LABELS.Done },
]
const STATUS_FILTER_STORAGE_KEY = 'schedulePlanner.taskStatusFilter'

function loadSortBy() {
  const stored = localStorage.getItem(SORT_STORAGE_KEY)
  return SORT_OPTIONS.some((o) => o.value === stored) ? stored : 'id'
}

function loadStatusFilter() {
  const stored = localStorage.getItem(STATUS_FILTER_STORAGE_KEY)
  return STATUS_FILTER_OPTIONS.some((o) => o.value === stored) ? stored : 'all'
}

const scheduleStore = useScheduleStore()
const tasksStore = useTasksStore()
const { isNarrowViewport } = useAppShell()

const sortBy = ref(loadSortBy())
watch(sortBy, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

const statusFilter = ref(loadStatusFilter())
watch(statusFilter, (value) => localStorage.setItem(STATUS_FILTER_STORAGE_KEY, value))

// Entries/tasks are already loaded app-wide (see App.vue) - this just
// re-checks the auto Open -> In Progress transition in case an entry's
// start time has passed since app load, while the user was on another page.
onMounted(() => {
  tasksStore.syncAutoStatuses(scheduleStore.entries)
})

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

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
  if (statusFilter.value === 'all') {
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

const taskCards = computed(() =>
  tasksStore.tasks
    .filter((t) => statusFilter.value === 'all' || t.status === statusFilter.value)
    .map(taskCard)
    .sort(compareTasks),
)

function formatDiff(task) {
  if (task.realMinutes === 0) return 'not started'
  if (task.diffMinutes === 0) return 'on target'
  const sign = task.diffMinutes > 0 ? '+' : '-'
  return `${sign}${hoursFor(Math.abs(task.diffMinutes))}`
}

function formatDueDate(dueDate) {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

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
        <label class="sort-control">
          Filter
          <select v-model="statusFilter">
            <option v-for="o in STATUS_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
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

    <p v-else-if="taskCards.length === 0 && statusFilter !== 'all'" class="empty-state">
      No tasks match this filter.
    </p>

    <p v-else-if="taskCards.length === 0" class="empty-state">
      No tasks yet. Add one to start tracking estimated vs. real time.
    </p>

    <div v-else class="task-grid">
      <button
        v-for="task in taskCards"
        :key="task.id"
        type="button"
        class="task-card"
        @click="openEdit(task)"
      >
        <div class="task-card-top">
          <span class="task-id">#{{ task.id }}</span>
          <span v-if="task.status !== 'Open'" class="status-badge" :class="'badge-' + task.status">{{ STATUS_LABELS[task.status] }}</span>
        </div>

        <h3 class="task-name">
          <span v-if="task.color" class="task-color-swatch" :style="{ background: task.color }" title="Color shown on this task's timeline entries"></span>
          <span class="task-name-text">{{ task.name }}</span>
        </h3>

        <span v-if="task.dueDate" class="task-due-date"><CalendarDays :size="11" /> Due {{ formatDueDate(task.dueDate) }}</span>

        <p v-if="task.notes" class="task-notes" :title="task.notes">{{ task.notes }}</p>

        <div class="task-stats">
          <div class="task-stat">
            <span class="task-stat-label">Planned</span>
            <span class="task-stat-value">{{ hoursFor(task.estimatedMinutes) }}</span>
          </div>
          <div class="task-stat">
            <span class="task-stat-label">Real</span>
            <span class="task-stat-value">{{ hoursFor(task.realMinutes) }}</span>
          </div>
          <div class="task-stat">
            <span class="task-stat-label">Diff</span>
            <span class="task-stat-value" :class="task.diffStatus ? 'status-' + task.diffStatus : ''">
              {{ formatDiff(task) }}
            </span>
          </div>
        </div>

        <button
          v-if="!isNarrowViewport && task.status !== 'Done'"
          type="button"
          class="quick-complete"
          title="Mark task complete"
          aria-label="Mark task complete"
          @click="handleQuickComplete(task, $event)"
        >
          <Check :size="12" />
        </button>

        <button
          v-if="!isNarrowViewport"
          type="button"
          class="quick-delete"
          title="Delete task"
          aria-label="Delete task"
          @click="handleQuickDelete(task, $event)"
        >
          <X :size="12" />
        </button>
      </button>
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

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.task-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  padding: 16px 18px;
  font-family: inherit;
  cursor: pointer;
  animation: fadeUp 0.4s var(--ease) both;
  transition: border-color 0.16s;
}

.task-card:hover {
  border-color: var(--accent);
}

.task-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-id {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
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

.status-badge.badge-Open {
  color: var(--mute);
  border-color: var(--line-2);
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

.task-name {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 500;
  color: var(--fg);
  min-width: 0;
}

.task-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-color-swatch {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: var(--r);
  border: 1px solid color-mix(in srgb, var(--fg) 20%, transparent);
}

.task-due-date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--mute);
}

.task-notes {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.4;
  /* Clamp to 2 lines instead of letting a long note stretch the card - the
     full text is still available via the native title tooltip on hover. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-stats {
  display: flex;
  gap: 16px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.task-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-stat-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.task-stat-value {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg);
}

.task-stat-value.status-green {
  color: var(--ok);
}

.task-stat-value.status-yellow {
  color: var(--warn);
}

.task-stat-value.status-red {
  color: var(--bad);
}

.quick-delete,
.quick-complete {
  position: absolute;
  top: -8px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--mute);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.16s,
    color 0.16s,
    border-color 0.16s,
    background-color 0.16s;
}

.quick-delete {
  right: -8px;
}

.quick-complete {
  right: 18px;
}

.task-card:hover .quick-delete,
.task-card:hover .quick-complete {
  opacity: 1;
}

.quick-delete:hover {
  color: #fff;
  background: var(--bad);
  border-color: var(--bad);
}

.quick-complete:hover {
  color: #fff;
  background: var(--ok);
  border-color: var(--ok);
}

@media (max-width: 900px) {
  .task-grid {
    grid-template-columns: 1fr;
  }
}
</style>
