<script setup>
import { ref } from 'vue'
import { CalendarDays, Check, ChevronDown, ChevronUp, X } from '@lucide/vue'
import { formatHours } from '@/utils/date'

const props = defineProps({
  task: { type: Object, required: true },
  statusLabel: { type: String, required: true },
  isNarrowViewport: { type: Boolean, required: true },
  // Only populated (by TasksView) for a Group task - its subtasks, for the
  // inline expandable preview below.
  subtasks: { type: Array, default: () => [] },
})

defineEmits(['edit', 'quick-complete', 'quick-delete'])

const expanded = ref(false)

function toggleExpanded(event) {
  event.stopPropagation()
  expanded.value = !expanded.value
}

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

const doneSubtaskCount = (subtasks) => subtasks.filter((t) => t.status === 'Done').length

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
</script>

<template>
  <button type="button" class="task-card" @click="$emit('edit')">
    <div class="task-card-top">
      <span class="task-id-group">
        <span v-if="task.priority !== 'None'" class="priority-dot" :class="'priority-' + task.priority" :title="task.priority + ' priority'"></span>
        <span class="task-id">#{{ task.id }}</span>
      </span>
      <span class="status-badge" :class="'badge-' + task.status">{{ statusLabel }}</span>
    </div>

    <h3 class="task-name">
      <span v-if="task.color" class="task-color-swatch" :style="{ background: task.color }" title="Color shown on this task's timeline entries"></span>
      <span class="task-name-text">{{ task.name }}</span>
    </h3>

    <span v-if="task.dueDate" class="task-due-date"><CalendarDays :size="11" /> Due {{ formatDueDate(task.dueDate) }}</span>

    <div v-if="task.tags && task.tags.length > 0" class="task-tags">
      <span v-for="tag in task.tags" :key="tag.id" class="task-tag-chip">
        <span class="task-tag-swatch" :style="{ background: tag.color || 'var(--line-2)' }"></span>
        {{ tag.name }}
      </span>
    </div>

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

    <div v-if="task.taskType === 'Group'" class="subtask-preview">
      <button type="button" class="subtask-toggle" @click="toggleExpanded">
        <component :is="expanded ? ChevronUp : ChevronDown" :size="12" />
        {{ subtasks.length }} subtask{{ subtasks.length === 1 ? '' : 's' }}
        <span v-if="subtasks.length > 0" class="subtask-done-count">· {{ doneSubtaskCount(subtasks) }} done</span>
      </button>
      <ul v-if="expanded && subtasks.length > 0" class="subtask-preview-list">
        <li v-for="t in subtasks" :key="t.id" class="subtask-preview-row">
          <span class="subtask-preview-status" :class="'badge-' + t.status"></span>
          <span class="subtask-preview-name">{{ t.name }}</span>
          <span class="subtask-preview-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
        </li>
      </ul>
    </div>

    <button
      v-if="!isNarrowViewport && task.status !== 'Done'"
      type="button"
      class="quick-complete"
      title="Mark task complete"
      aria-label="Mark task complete"
      @click="$emit('quick-complete', $event)"
    >
      <Check :size="12" />
    </button>

    <button
      v-if="!isNarrowViewport"
      type="button"
      class="quick-delete"
      title="Delete task"
      aria-label="Delete task"
      @click="$emit('quick-delete', $event)"
    >
      <X :size="12" />
    </button>
  </button>
</template>

<style scoped>
.task-card {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
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

.task-id-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.task-id {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
}

.priority-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
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

.task-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.task-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  font-size: 10px;
  color: var(--mute);
}

.task-tag-swatch {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
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

.subtask-preview {
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.subtask-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: 11px;
  color: var(--mute);
  cursor: pointer;
}

.subtask-toggle:hover {
  color: var(--fg);
}

.subtask-done-count {
  color: var(--mute);
}

.subtask-preview-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

.subtask-preview-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 4px;
}

.subtask-preview-status {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--line-2);
}

.subtask-preview-status.badge-Backlog {
  background: var(--mute);
}

.subtask-preview-status.badge-Ready {
  background: var(--warn);
}

.subtask-preview-status.badge-InProgress {
  background: var(--accent);
}

.subtask-preview-status.badge-Done {
  background: var(--ok);
}

.subtask-preview-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--dim);
}

.subtask-preview-minutes {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
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
</style>
