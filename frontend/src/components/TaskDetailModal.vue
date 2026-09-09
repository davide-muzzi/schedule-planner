<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Expand, Pencil, X } from '@lucide/vue'
import { formatHours } from '@/utils/date'
import { isOverdue } from '@/utils/taskStats'

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }

const props = defineProps({
  task: { type: Object, required: true },
  // Only meaningful (and only passed) for a Group task - its subtasks, for
  // the right-hand column in the wide layout.
  subtasks: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'edit', 'delete'])

const isGroup = computed(() => props.task.taskType === 'Group')

// The subtask currently expanded into its own (nested) detail modal, on top
// of this one - recursive self-usage, see the template.
const nestedSubtask = ref(null)

// If the nested subtask gets deleted (or unlinked) while its detail is open,
// `subtasks` updates live and it drops out of the list - close the now-stale
// nested view rather than leaving it pointing at a deleted task.
watch(
  () => props.subtasks,
  (list) => {
    if (nestedSubtask.value && !list.some((t) => t.id === nestedSubtask.value.id)) {
      nestedSubtask.value = null
    }
  },
)

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

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

const doneSubtaskCount = computed(() => props.subtasks.filter((t) => t.status === 'Done').length)

// Same "did the mousedown actually start on the bare overlay" guard used by
// the other modals, so a drag that starts on the card and ends up over the
// overlay doesn't close it.
let mouseDownOnOverlay = false
function handleOverlayMouseDown(event) {
  mouseDownOnOverlay = event.target === event.currentTarget
}
function handleOverlayClick(event) {
  if (mouseDownOnOverlay && event.target === event.currentTarget) emit('close')
}

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  // A nested subtask's own instance has an identical listener - let it
  // handle its own Escape (and close just itself) before this one does.
  if (nestedSubtask.value) return
  emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="detail-overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
      <div class="detail-modal" :class="{ 'detail-modal-wide': isGroup }">
        <header class="detail-header">
          <span class="detail-id-group">
            <span v-if="task.priority !== 'None'" class="priority-dot" :class="'priority-' + task.priority" :title="task.priority + ' priority'"></span>
            <span class="detail-id">#{{ task.id }}</span>
            <span class="detail-status">{{ STATUS_LABELS[task.status] || task.status }}</span>
          </span>
          <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="18" /></button>
        </header>

        <div class="detail-body" :class="{ 'detail-body-split': isGroup }">
          <div class="detail-main">
            <h2 class="detail-name">
              <span v-if="task.color" class="task-color-swatch" :style="{ background: task.color }" title="Color shown on this task's timeline entries"></span>
              {{ task.name }}
            </h2>

            <span v-if="task.dueDate" class="task-due-date" :class="{ overdue: isOverdue(task) }">
              <CalendarDays :size="12" /> Due {{ formatDueDate(task.dueDate) }}
            </span>

            <div v-if="task.tags && task.tags.length > 0" class="detail-tags">
              <span v-for="tag in task.tags" :key="tag.id" class="task-tag-chip">
                <span class="task-tag-swatch" :style="{ background: tag.color || 'var(--line-2)' }"></span>
                {{ tag.name }}
              </span>
            </div>

            <p v-if="task.notes" class="detail-notes">{{ task.notes }}</p>

            <div class="detail-stats">
              <div class="detail-stat">
                <span class="detail-stat-label">Planned</span>
                <span class="detail-stat-value">{{ hoursFor(task.estimatedMinutes) }}</span>
              </div>
              <template v-if="task.realMinutes !== undefined">
                <div class="detail-stat">
                  <span class="detail-stat-label">Real</span>
                  <span class="detail-stat-value">{{ hoursFor(task.realMinutes) }}</span>
                </div>
                <div class="detail-stat">
                  <span class="detail-stat-label">Diff</span>
                  <span class="detail-stat-value" :class="task.diffStatus ? 'status-' + task.diffStatus : ''">
                    {{ formatDiff(task) }}
                  </span>
                </div>
              </template>
            </div>
          </div>

          <div v-if="isGroup" class="detail-subtasks">
            <h3 class="detail-subtasks-heading">
              {{ subtasks.length }} subtask{{ subtasks.length === 1 ? '' : 's' }}
              <span v-if="subtasks.length > 0" class="subtask-done-count">· {{ doneSubtaskCount }} done</span>
            </h3>
            <p v-if="subtasks.length === 0" class="detail-subtasks-empty">No subtasks yet.</p>
            <ul v-else class="detail-subtask-list">
              <li v-for="t in subtasks" :key="t.id" class="detail-subtask-row">
                <button type="button" class="detail-subtask-main" @click="nestedSubtask = t">
                  <span class="priority-dot" :class="'priority-' + t.priority"></span>
                  <span class="detail-subtask-name" :class="{ 'is-done': t.status === 'Done' }">{{ t.name }}</span>
                  <span class="detail-subtask-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
                </button>
                <button type="button" class="detail-subtask-expand" title="Expand subtask" aria-label="Expand subtask" @click="nestedSubtask = t">
                  <Expand :size="12" />
                </button>
              </li>
            </ul>
          </div>
        </div>

        <footer class="detail-footer">
          <button type="button" class="detail-delete-btn" @click="emit('delete', task.id)">Delete</button>
          <span class="detail-footer-spacer"></span>
          <button type="button" class="detail-edit-btn" @click="emit('edit', task)"><Pencil :size="13" /> Edit</button>
        </footer>
      </div>
    </div>
  </Teleport>

  <TaskDetailModal
    v-if="nestedSubtask"
    :task="nestedSubtask"
    :subtasks="[]"
    @close="nestedSubtask = null"
    @edit="(t) => emit('edit', t)"
    @delete="(id) => emit('delete', id)"
  />
</template>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 16px;
}

.detail-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 30rem;
  max-height: 90vh;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  animation: fadeUp 0.3s var(--ease) both;
  overflow: hidden;
}

.detail-modal-wide {
  max-width: 46rem;
}

@media (max-width: 900px) {
  .detail-modal-wide {
    max-width: 30rem;
  }

  .detail-body-split {
    display: flex !important;
    flex-direction: column;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}

.detail-id-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--mute);
}

.detail-status {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--mute);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.close-btn:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 20px;
  overflow-y: auto;
}

.detail-body-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.detail-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.detail-name {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--fg);
  overflow-wrap: break-word;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-notes {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dim);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.detail-stats {
  display: flex;
  gap: 22px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.detail-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.detail-stat-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.detail-stat-value {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--fg);
}

.detail-stat-value.status-green {
  color: var(--ok);
}

.detail-stat-value.status-yellow {
  color: var(--warn);
}

.detail-stat-value.status-red {
  color: var(--bad);
}

.detail-subtasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.detail-subtasks-heading {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mute);
}

.subtask-done-count {
  font-weight: 400;
  color: var(--mute);
}

.detail-subtasks-empty {
  margin: 0;
  font-size: 12px;
  color: var(--mute);
}

.detail-subtask-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.detail-subtask-row {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface2);
  overflow: hidden;
  transition: border-color 0.16s;
}

.detail-subtask-row:hover {
  border-color: var(--accent);
}

.detail-subtask-main {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  padding: 8px 9px;
  border: none;
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.detail-subtask-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
  font-size: 12px;
  color: var(--dim);
}

.detail-subtask-name.is-done {
  color: var(--ok);
}

.detail-subtask-minutes {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
}

.detail-subtask-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  border: none;
  border-left: 1px solid var(--line);
  background: none;
  color: var(--mute);
  cursor: pointer;
  transition:
    color 0.16s,
    background-color 0.16s;
}

.detail-subtask-expand:hover {
  color: var(--accent);
  background: var(--surface);
}

.detail-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
}

.detail-footer-spacer {
  flex: 1;
}

.detail-delete-btn {
  padding: 7px 14px;
  border-radius: var(--r);
  border: 1px solid var(--bad);
  background: transparent;
  color: var(--bad);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.16s,
    color 0.16s;
}

.detail-delete-btn:hover {
  background: var(--bad);
  color: #fff;
}

.detail-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--r);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--bg);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.16s;
}

.detail-edit-btn:hover {
  opacity: 0.85;
}

.priority-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.priority-dot.priority-None {
  background: var(--mute);
}

.priority-dot.priority-Low {
  background: var(--accent);
}

.priority-dot.priority-Medium {
  background: var(--warn);
}

.priority-dot.priority-High {
  background: var(--bad);
}

.task-color-swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: var(--r);
  border: 1px solid color-mix(in srgb, var(--fg) 20%, transparent);
}

.task-due-date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--mute);
}

.task-due-date.overdue {
  color: var(--bad);
}

.task-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  font-size: 10.5px;
  color: var(--mute);
}

.task-tag-swatch {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
