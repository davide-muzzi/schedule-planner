<script setup>
import { computed, onMounted, ref } from 'vue'
import { Plus, X } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { formatHours } from '@/utils/date'
import { realMinutesForTask } from '@/utils/taskStats'
import { taskDiffStatus } from '@/utils/status'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'

const STATUS_LABELS = { Open: 'Open', InProgress: 'In Progress', Done: 'Done' }
const STATUS_ORDER = { Open: 0, InProgress: 1, Done: 2 }

const scheduleStore = useScheduleStore()
const tasksStore = useTasksStore()

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

const taskCards = computed(() =>
  tasksStore.tasks
    .map(taskCard)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id - b.id),
)

function formatDiff(task) {
  if (task.realMinutes === 0) return 'not started'
  if (task.diffMinutes === 0) return 'on target'
  const sign = task.diffMinutes > 0 ? '+' : '-'
  return `${sign}${hoursFor(Math.abs(task.diffMinutes))}`
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
</script>

<template>
  <section class="page">
    <div class="tasks-header">
      <div class="header-title">
        <p class="kicker">To-do</p>
        <h1 class="title">Tasks</h1>
      </div>
      <button type="button" class="add-btn" @click="openAdd"><Plus :size="14" /> New Task</button>
    </div>

    <div v-if="tasksStore.error && !showModal" class="global-error">
      {{ tasksStore.error }}
      <button type="button" @click="tasksStore.clearError()"><X :size="16" /></button>
    </div>

    <p v-if="tasksStore.loading" class="loading">Loading…</p>

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
          <span class="status-badge" :class="'badge-' + task.status">{{ STATUS_LABELS[task.status] }}</span>
        </div>

        <h3 class="task-name">
          <span v-if="task.color" class="task-color-swatch" :style="{ background: task.color }" title="Color shown on this task's timeline entries"></span>
          <span class="task-name-text">{{ task.name }}</span>
        </h3>

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

        <button type="button" class="quick-delete" title="Delete task" aria-label="Delete task" @click="handleQuickDelete(task, $event)">
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

.quick-delete {
  position: absolute;
  top: -8px;
  right: -8px;
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

.task-card:hover .quick-delete {
  opacity: 1;
}

.quick-delete:hover {
  color: #fff;
  background: var(--bad);
  border-color: var(--bad);
}

@media (max-width: 900px) {
  .task-grid {
    grid-template-columns: 1fr;
  }

  .quick-delete {
    opacity: 1;
  }
}
</style>
