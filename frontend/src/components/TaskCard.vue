<script setup>
import { computed, ref } from 'vue'
import { CalendarDays, Check, ChevronDown, ChevronUp, Pencil, X } from '@lucide/vue'
import { formatHours } from '@/utils/date'
import { isOverdue } from '@/utils/taskStats'
import { useFloatingMenu } from '@/composables/useFloatingMenu'
import { useCtrlHeld } from '@/composables/useCtrlHeld'
import TagPopup from './TagPopup.vue'

const PRIORITIES = ['None', 'Low', 'Medium', 'High']

const props = defineProps({
  task: { type: Object, required: true },
  isNarrowViewport: { type: Boolean, required: true },
  // Only populated (by TasksView) for a Group task - its subtasks, for the
  // inline expandable preview below.
  subtasks: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'edit',
  'quick-complete',
  'quick-reopen',
  'quick-delete',
  'edit-subtask',
  'toggle-subtask-done',
  'update-subtask-priority',
  'update-tags',
])

const expanded = ref(false)

function toggleExpanded(event) {
  event.stopPropagation()
  expanded.value = !expanded.value
}

// Which single subtask (by id) currently has its detail panel open - one at
// a time, mirroring the group card's own single `expanded` toggle.
const openSubtaskId = ref(null)

const {
  openId: openPriorityFor,
  position: priorityMenuPosition,
  setMenuEl: setPriorityMenuEl,
  toggle: togglePriorityMenu,
  close: closePriorityMenu,
} = useFloatingMenu()

const ctrlHeld = useCtrlHeld()

function toggleSubtaskDetail(id) {
  closePriorityMenu()
  openSubtaskId.value = openSubtaskId.value === id ? null : id
}

function selectPriority(task, priority) {
  closePriorityMenu()
  if (task.priority !== priority) emit('update-subtask-priority', task, priority)
}

// Tags popup for the card's own tags.
const {
  openId: openTagsFor,
  position: tagsPopupPosition,
  setMenuEl: setTagsPopupEl,
  toggle: toggleTagsPopup,
  close: closeTagsPopup,
} = useFloatingMenu()

const tagsPopupTarget = computed(() => (openTagsFor.value === 'task' ? props.task : null))

function handleAddTag(tagId) {
  const target = tagsPopupTarget.value
  if (!target) return
  emit('update-tags', target, [...(target.tags || []).map((t) => t.id), tagId])
}

function handleRemoveTag(tagId) {
  const target = tagsPopupTarget.value
  if (!target) return
  emit(
    'update-tags',
    target,
    (target.tags || []).map((t) => t.id).filter((id) => id !== tagId),
  )
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
      <label
        class="task-done-checkbox"
        :class="{ disabled: task.status === 'Backlog', done: task.status === 'Done' }"
        :title="task.status === 'Backlog' ? 'Link this to a planner entry before marking it done' : (task.status === 'Done' ? 'Reopen task' : 'Mark task complete')"
      >
        <input
          type="checkbox"
          :checked="task.status === 'Done'"
          :disabled="task.status === 'Backlog'"
          @click.stop
          @change="$event.target.checked ? $emit('quick-complete', $event) : $emit('quick-reopen', $event)"
        />
      </label>
    </div>

    <h3 class="task-name">
      <span v-if="task.color" class="task-color-swatch" :style="{ background: task.color }" title="Color shown on this task's timeline entries"></span>
      <span class="task-name-text">{{ task.name }}</span>
    </h3>

    <span v-if="task.dueDate" class="task-due-date" :class="{ overdue: isOverdue(task) }"><CalendarDays :size="11" /> Due {{ formatDueDate(task.dueDate) }}</span>

    <div v-if="task.tags && task.tags.length > 0" class="task-tags">
      <span v-for="tag in task.tags.slice(0, 2)" :key="tag.id" class="task-tag-chip">
        <span class="task-tag-swatch" :style="{ background: tag.color || 'var(--line-2)' }"></span>
        {{ tag.name }}
      </span>
      <button
        v-if="task.tags.length > 2"
        type="button"
        class="tag-more-pill"
        :aria-label="`${task.tags.length - 2} more tags - click to view`"
        @click.stop="toggleTagsPopup('task', $event)"
      >
        +{{ task.tags.length - 2 }}
      </button>
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
        <span class="subtask-toggle-label">
          {{ subtasks.length }} subtask{{ subtasks.length === 1 ? '' : 's' }}
          <span v-if="subtasks.length > 0" class="subtask-done-count">· {{ doneSubtaskCount(subtasks) }} done</span>
        </span>
        <component :is="expanded ? ChevronUp : ChevronDown" :size="12" />
      </button>
      <ul v-if="expanded && subtasks.length > 0" class="subtask-preview-list">
        <li v-for="t in subtasks" :key="t.id" class="subtask-preview-row" :class="{ expanded: openSubtaskId === t.id }">
          <div class="subtask-preview-main" @click.stop="toggleSubtaskDetail(t.id)">
            <span class="subtask-priority-wrap" :class="{ 'ctrl-mode': ctrlHeld }">
              <button
                type="button"
                class="priority-dot interactive-dot priority-dot-normal"
                :class="'priority-' + t.priority"
                :title="`${t.priority} priority - click to change`"
                :aria-label="`${t.priority} priority - click to change`"
                @click.stop="togglePriorityMenu(t.id, $event)"
              ></button>
              <button
                type="button"
                class="quick-done-swap"
                :class="{ checked: t.status === 'Done' }"
                :disabled="t.status === 'Backlog'"
                :title="t.status === 'Backlog' ? 'Link this task (or its group) to a planner entry before marking it done' : 'Ctrl+click: mark subtask done'"
                aria-label="Mark subtask done"
                @click.stop="$emit('toggle-subtask-done', t, t.status !== 'Done')"
              >
                <Check :size="8" />
              </button>
              <Teleport to="body">
                <div
                  v-if="openPriorityFor === t.id"
                  :ref="setPriorityMenuEl"
                  class="priority-menu"
                  :style="{ top: priorityMenuPosition.top + 'px', left: priorityMenuPosition.left + 'px' }"
                >
                  <button
                    v-for="p in PRIORITIES"
                    :key="p"
                    type="button"
                    class="priority-menu-option"
                    :class="{ active: t.priority === p }"
                    @click="selectPriority(t, p)"
                  >
                    <span class="priority-dot" :class="'priority-' + p"></span>
                    {{ p }}
                  </button>
                </div>
              </Teleport>
            </span>
            <span class="subtask-preview-name" :class="{ 'is-done': t.status === 'Done' }">{{ t.name }}</span>
            <span class="subtask-preview-minutes" :class="{ 'is-done': t.status === 'Done' }">{{ hoursFor(t.estimatedMinutes) }}</span>
          </div>
          <div v-if="openSubtaskId === t.id" class="subtask-detail" @click.stop>
            <p v-if="t.notes" class="subtask-detail-notes">{{ t.notes }}</p>
            <div v-if="t.tags && t.tags.length > 0" class="subtask-detail-tags">
              <span v-for="tag in t.tags" :key="tag.id" class="task-tag-chip">
                <span class="task-tag-swatch" :style="{ background: tag.color || 'var(--line-2)' }"></span>
                {{ tag.name }}
              </span>
            </div>
            <div class="subtask-detail-actions">
              <button
                type="button"
                class="subtask-edit-btn"
                title="Edit subtask"
                aria-label="Edit subtask"
                @click="$emit('edit-subtask', t)"
              >
                <Pencil :size="12" />
              </button>
              <label
                class="subtask-done-checkbox"
                :class="{ disabled: t.status === 'Backlog' }"
                :title="t.status === 'Backlog' ? 'Link this task (or its group) to a planner entry before marking it done' : undefined"
              >
                <input
                  type="checkbox"
                  :checked="t.status === 'Done'"
                  :disabled="t.status === 'Backlog'"
                  @click.stop
                  @change="$emit('toggle-subtask-done', t, $event.target.checked)"
                />
                Done
              </label>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <Teleport to="body">
      <div
        v-if="tagsPopupTarget"
        :ref="setTagsPopupEl"
        class="tag-popup-anchor"
        :style="{ top: tagsPopupPosition.top + 'px', left: tagsPopupPosition.left + 'px' }"
        @click.stop
      >
        <TagPopup :tags="tagsPopupTarget.tags || []" @add="handleAddTag" @remove="handleRemoveTag" @close="closeTagsPopup" />
      </div>
    </Teleport>

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

.task-done-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.16s;
}

.task-card:hover .task-done-checkbox,
.task-done-checkbox.done {
  opacity: 1;
}

.task-done-checkbox.disabled {
  cursor: not-allowed;
}

.task-done-checkbox input {
  width: 15px;
  height: 15px;
  accent-color: var(--ok);
  cursor: pointer;
}

.task-done-checkbox input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
  overflow-wrap: break-word;
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

.task-due-date.overdue {
  color: var(--bad);
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

.tag-more-pill {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--mute);
  font-family: var(--font-mono);
  font-size: 9.5px;
  cursor: pointer;
}

.tag-more-pill:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tag-popup-anchor {
  position: fixed;
  z-index: 60;
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
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  background: none;
  border: none;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: var(--r);
  font-family: inherit;
  font-size: 11px;
  color: var(--mute);
  cursor: pointer;
  transition:
    color 0.16s,
    background-color 0.16s;
}

.subtask-toggle-label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.subtask-toggle:hover {
  color: var(--fg);
  background: var(--surface2);
}

.subtask-done-count {
  color: var(--mute);
}

.subtask-preview-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

.subtask-preview-row {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface2);
  overflow: hidden;
  transition: border-color 0.16s;
}

.subtask-preview-row:hover,
.subtask-preview-row.expanded {
  border-color: var(--accent);
}

.subtask-preview-main {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  cursor: pointer;
}

.subtask-preview-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
  font-size: 11.5px;
  color: var(--dim);
}

.subtask-preview-name.is-done {
  color: var(--ok);
}

.subtask-preview-minutes {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--mute);
}

.subtask-preview-minutes.is-done {
  color: var(--ok);
}

.subtask-priority-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}

.priority-dot.priority-None {
  background: var(--mute);
}

.priority-dot.interactive-dot {
  width: 8px;
  height: 8px;
  border: none;
  padding: 0;
  cursor: pointer;
}

.priority-dot.interactive-dot:hover {
  outline: 2px solid var(--line-2);
  outline-offset: 2px;
}

.quick-done-swap {
  display: none;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 10px;
  height: 10px;
  padding: 0;
  border-radius: 2px;
  border: 1px solid var(--line-2);
  background: transparent;
  color: transparent;
  cursor: pointer;
}

/* Holding Ctrl swaps every visible subtask's priority dot for a quick
   "mark done" checkbox (no hover needed - see useCtrlHeld), so completing a
   subtask doesn't require expanding its row first. */
.subtask-priority-wrap.ctrl-mode .priority-dot-normal {
  display: none;
}

.subtask-priority-wrap.ctrl-mode .quick-done-swap {
  display: flex;
}

.quick-done-swap:hover {
  border-color: var(--ok);
}

.quick-done-swap.checked {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
}

.quick-done-swap:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.quick-done-swap:disabled:hover {
  border-color: var(--line-2);
}

.priority-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.priority-menu-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border-radius: var(--r);
  border: none;
  background: transparent;
  color: var(--dim);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  text-align: left;
  cursor: pointer;
}

.priority-menu-option:hover {
  background: var(--surface2);
}

.priority-menu-option.active {
  color: var(--fg);
  font-weight: 600;
}

.subtask-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 9px 9px;
  border-top: 1px solid var(--line);
  cursor: default;
}

.subtask-detail-notes {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.4;
}

.subtask-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.subtask-detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subtask-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--mute);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.subtask-edit-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.subtask-done-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--mute);
  cursor: pointer;
}

.subtask-done-checkbox.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.subtask-done-checkbox input {
  accent-color: var(--ok);
  cursor: pointer;
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
</style>
