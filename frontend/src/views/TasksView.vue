<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { Plus, X, SlidersHorizontal, Tags, Search } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import { useAppShell } from '@/composables/useAppShell'
import {
  realMinutesForTask,
  plannedMinutesForGroup,
  subtasksOf,
  deriveTaskStatus,
  taskUpdatePayload,
} from '@/utils/taskStats'
import { taskDiffStatus } from '@/utils/status'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'
import TaskFilterModal from '@/components/TaskFilterModal.vue'
import TaskCard from '@/components/TaskCard.vue'
import ChoiceDialog from '@/components/ChoiceDialog.vue'
import TagManageModal from '@/components/TagManageModal.vue'

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }

// The Kanban board's columns, left to right - the same 4 values drive the
// Status filter category below.
const COLUMN_STATUSES = ['Backlog', 'Ready', 'InProgress', 'Done']
const STATUS_HINTS = {
  Backlog: 'Not prioritized yet',
  Ready: 'Ready to start',
  InProgress: 'Actively being worked on',
  Done: 'Finished',
}

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
      { value: 'Ready', label: STATUS_LABELS.Ready },
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
    // Multiple tags selected here is an AND, not an OR - see matchesFilters.
    multiSelect: true,
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
    const storedValue = stored && typeof stored === 'object' ? stored[category.key] : undefined
    const validValues = category.options.map((o) => o.value)
    if (category.multiSelect) {
      result[category.key] = Array.isArray(storedValue) ? storedValue.filter((v) => validValues.includes(v)) : []
    } else if (validValues.includes(storedValue)) {
      result[category.key] = storedValue
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
  () =>
    FILTER_CATEGORIES.value.filter((c) => {
      const v = filters.value[c.key]
      return c.multiSelect ? Array.isArray(v) && v.length > 0 : (v ?? 'all') !== 'all'
    }).length,
)

// Free-text search by name/id - deliberately not persisted (unlike
// sort/filters) since a search is a one-off "find this" action, not a
// lasting view preference you'd want restored on your next visit.
const searchQuery = ref('')
const showMobileSearch = ref(false)
const mobileSearchInputEl = ref(null)

function toggleMobileSearch() {
  showMobileSearch.value = !showMobileSearch.value
  if (showMobileSearch.value) {
    nextTick(() => mobileSearchInputEl.value?.focus())
  } else {
    searchQuery.value = ''
  }
}

function closeMobileSearch() {
  showMobileSearch.value = false
  searchQuery.value = ''
}

// Staggers each card's entrance by its position within its own column, in
// the first non-empty task list this view sees, captured once - same
// reasoning as DayTable's own entry stagger: a task created afterward (or a
// filter/sort/drag change reshuffling what's visible) shouldn't replay the
// cascade for every existing card, so anything outside that captured set
// just gets 0ms. Per-column (not global) so all four columns cascade in
// parallel rather than one long snaking delay down the board.
const STAGGER_STEP_MS = 40
const STAGGER_MAX_MS = 400
const initialColumnOrder = ref({})
let capturedInitialOrder = false

watch(
  () => tasksStore.tasks,
  (tasks) => {
    if (capturedInitialOrder || tasks.length === 0) return
    capturedInitialOrder = true
    const visible = tasks.filter((t) => t.parentTaskId == null)
    const byStatus = {}
    for (const status of COLUMN_STATUSES) {
      byStatus[status] = new Map(visible.filter((t) => t.status === status).map((t, i) => [t.id, i]))
    }
    initialColumnOrder.value = byStatus
  },
  { immediate: true },
)

function taskCardDelay(task) {
  const idx = initialColumnOrder.value[task.status]?.get(task.id)
  if (idx === undefined) return '0ms'
  return `${Math.min(idx * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`
}

// Entries/tasks are already loaded app-wide (see App.vue, which also keeps
// re-checking this live every minute) - this just catches it immediately
// after navigating in, rather than waiting for the next tick of that timer.
onMounted(() => {
  tasksStore.syncTaskStatuses(scheduleStore.entries)
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

// Both orderings are ascending, per-field, with id as the tiebreaker.
// dueDate is a "YYYY-MM-DD" string (or null) - plain string comparison
// already sorts it chronologically; tasks with no due date always sort
// after every dated one, regardless of which field is active. This is the
// fallback order for cards a column hasn't had manually dragged yet - see
// syncColumnLists below.
function compareTasks(a, b) {
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
  // AND, not OR - a task has to carry every selected tag, not just one of them.
  const selectedTags = Array.isArray(f.tags) ? f.tags : []
  if (selectedTags.length > 0) {
    const taskTagIds = new Set((task.tags || []).map((t) => String(t.id)))
    if (!selectedTags.every((id) => taskTagIds.has(id))) return false
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q && !task.name.toLowerCase().includes(q) && !String(task.id).includes(q)) return false
  return true
}

// Subtasks never appear as their own top-level cards - they render nested
// inside their Group's card instead (see TaskCard's subtask-preview).
const taskCards = computed(() =>
  tasksStore.tasks.filter((t) => t.parentTaskId == null).filter(matchesFilters).map(taskCard),
)

// --- Kanban board: per-column ordering, persisted client-side only ---

const KANBAN_ORDER_STORAGE_KEY = 'schedulePlanner.taskKanbanOrder'

function loadColumnOrders() {
  try {
    const stored = JSON.parse(localStorage.getItem(KANBAN_ORDER_STORAGE_KEY))
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

// { [status]: [taskId, ...] } - only ever contains ids for cards that have
// actually been dragged at least once; everything else is ordered live by
// the sort dropdown instead (see syncColumnLists).
const columnOrders = ref(loadColumnOrders())

function persistColumnOrders() {
  localStorage.setItem(KANBAN_ORDER_STORAGE_KEY, JSON.stringify(columnOrders.value))
}

// The actual per-column arrays rendered/dragged - <draggable> mutates these
// directly via v-model during a drag, so they're plain reactive state, not
// a computed. Manually-ordered cards (per columnOrders) keep their pinned
// position; anything not yet dragged falls back to the live sort
// comparator, appended after the pinned ones.
const columnLists = reactive(Object.fromEntries(COLUMN_STATUSES.map((s) => [s, []])))

function syncColumnLists() {
  for (const status of COLUMN_STATUSES) {
    const cardsInColumn = taskCards.value.filter((t) => t.status === status)
    const order = columnOrders.value[status] || []
    const byId = new Map(cardsInColumn.map((c) => [c.id, c]))
    const pinned = order.filter((id) => byId.has(id)).map((id) => byId.get(id))
    const pinnedIds = new Set(order)
    const rest = cardsInColumn.filter((c) => !pinnedIds.has(c.id)).sort(compareTasks)
    columnLists[status] = [...pinned, ...rest]
  }
}

watch(taskCards, syncColumnLists, { immediate: true })
watch(sortBy, syncColumnLists)

// Fires when a column's own order changes from a within-column drag (status
// is derived automatically now - see tasksStore.syncTaskStatuses - so each
// column has its own drag group and a card can no longer be dropped into a
// different one). Just persists the new order.
function handleColumnChange(status) {
  columnOrders.value[status] = columnLists[status].map((t) => t.id)
  persistColumnOrders()
}

// Mobile shows one column at a time (picked via a <select>) instead of a
// horizontally-scrolled 4-column row - remembered across visits the same
// way sort/filters are. Cross-column drag doesn't make sense when only one
// column is ever visible, so mobile only supports within-column reordering;
// changing status is still just a matter of editing the task.
const MOBILE_STATUS_STORAGE_KEY = 'schedulePlanner.taskKanbanMobileStatus'

function loadMobileStatus() {
  const stored = localStorage.getItem(MOBILE_STATUS_STORAGE_KEY)
  return COLUMN_STATUSES.includes(stored) ? stored : 'Backlog'
}

const mobileActiveStatus = ref(loadMobileStatus())
watch(mobileActiveStatus, (value) => localStorage.setItem(MOBILE_STATUS_STORAGE_KEY, value))

const visibleColumnStatuses = computed(() =>
  isNarrowViewport.value ? [mobileActiveStatus.value] : COLUMN_STATUSES,
)

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
    // Marking a Group Done takes every subtask with it.
    if (task.taskType === 'Group') await tasksStore.applyStatusToSubtasks(task.id, 'Done')
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

// Undoes a Done task/group - recomputes what its status should actually be
// from its current link/timing (not just a hardcoded Backlog), since it may
// already be linked to an entry that's already started.
async function handleQuickReopen(task, event) {
  event.stopPropagation()
  saving.value = true
  try {
    const reopened = deriveTaskStatus(scheduleStore.entries, task.id)
    await tasksStore.updateTask(task.id, taskUpdatePayload(task, { status: reopened }))
    if (task.taskType === 'Group') await tasksStore.applyStatusToSubtasks(task.id, reopened)
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

function handleEditSubtask(subtask) {
  openEdit(subtask)
}

// Checking marks just that one subtask Done, independent of its group - and
// if that leaves every subtask in the group Done, the group completes
// itself too (see maybeAutoCompleteGroup). Unchecking reopens the subtask by
// adopting its parent group's current status - a subtask is never linked to
// an entry of its own, so it has nothing else to derive from - except when
// the group itself is Done (because this was its last remaining open
// subtask, auto-completing it): reopening one subtask out of a finished
// group has to reopen the group too, or the subtask would incorrectly
// inherit "Done" right back from its own stale-Done parent.
async function handleToggleSubtaskDone(subtask, done) {
  saving.value = true
  try {
    if (done) {
      await tasksStore.updateTask(subtask.id, taskUpdatePayload(subtask, { status: 'Done' }))
      if (subtask.parentTaskId != null) await maybeAutoCompleteGroup(subtask.parentTaskId)
    } else {
      const group = subtask.parentTaskId != null ? tasksStore.tasks.find((t) => t.id === subtask.parentTaskId) : null
      let reopenStatus = group?.status ?? 'Backlog'
      if (group?.status === 'Done') {
        reopenStatus = deriveTaskStatus(scheduleStore.entries, group.id)
        await tasksStore.updateTask(group.id, taskUpdatePayload(group, { status: reopenStatus }))
      }
      await tasksStore.updateTask(subtask.id, taskUpdatePayload(subtask, { status: reopenStatus }))
    }
  } catch {
    modalError.value = tasksStore.error
  } finally {
    saving.value = false
  }
}

// If marking a subtask Done leaves its whole group with everything Done,
// the group completes itself too - no separate click on the group needed.
async function maybeAutoCompleteGroup(groupId) {
  const group = tasksStore.tasks.find((t) => t.id === groupId)
  if (!group || group.status === 'Done') return
  const siblings = subtasksOf(tasksStore.tasks, groupId)
  if (siblings.length === 0 || !siblings.every((t) => t.status === 'Done')) return
  await tasksStore.updateTask(group.id, taskUpdatePayload(group, { status: 'Done' }))
}

async function handleUpdateSubtaskPriority(subtask, priority) {
  try {
    await tasksStore.updateTask(subtask.id, taskUpdatePayload(subtask, { priority }))
  } catch {
    modalError.value = tasksStore.error
  }
}

// Generic across a top-level task/group or a subtask - the tags popup just
// hands back the target it was showing and the full new tagIds list.
async function handleUpdateTags(target, tagIds) {
  try {
    await tasksStore.updateTask(target.id, taskUpdatePayload(target, { tagIds }))
  } catch {
    modalError.value = tasksStore.error
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
      <div v-if="!isNarrowViewport" class="header-actions">
        <label class="sort-control">
          Sort by
          <select v-model="sortBy">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <button type="button" class="filter-btn" :class="{ active: activeFilterCount > 0 }" @click="showFilterModal = true">
          <SlidersHorizontal :size="14" /> Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span>
          <span v-if="activeFilterCount > 0" class="filter-dot" aria-hidden="true"></span>
        </button>
        <button type="button" class="filter-btn" @click="showTagManageModal = true">
          <Tags :size="14" /> Manage tags
        </button>
        <label class="search-control" :class="{ active: searchQuery }">
          <Search :size="14" />
          <input v-model="searchQuery" type="text" placeholder="Search tasks..." />
        </label>
        <button type="button" class="add-btn" @click="openAdd()"><Plus :size="14" /> New Task</button>
      </div>

      <div v-else class="header-actions-mobile">
        <div class="mobile-icon-row">
          <button
            type="button"
            class="icon-btn"
            :class="{ active: showMobileSearch || searchQuery }"
            aria-label="Search"
            title="Search"
            @click="toggleMobileSearch"
          >
            <Search :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :class="{ active: activeFilterCount > 0 }"
            aria-label="Filters"
            :title="`Filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`"
            @click="showFilterModal = true"
          >
            <SlidersHorizontal :size="16" />
            <span v-if="activeFilterCount > 0" class="filter-dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="icon-btn" aria-label="Manage tags" title="Manage tags" @click="showTagManageModal = true">
            <Tags :size="16" />
          </button>
          <button type="button" class="icon-btn add-icon-btn" aria-label="New task" title="New task" @click="openAdd()">
            <Plus :size="16" />
          </button>
        </div>

        <div v-if="showMobileSearch" class="mobile-search-row">
          <input
            ref="mobileSearchInputEl"
            v-model="searchQuery"
            type="text"
            placeholder="Search tasks..."
            class="mobile-search-input"
            @keydown.escape="closeMobileSearch"
          />
          <button type="button" class="icon-btn" aria-label="Close search" @click="closeMobileSearch">
            <X :size="16" />
          </button>
        </div>

        <label class="sort-control mobile-sort-control">
          Sort by
          <select v-model="sortBy">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="tasksStore.error && !showModal" class="global-error">
      {{ tasksStore.error }}
      <button type="button" @click="tasksStore.clearError()"><X :size="16" /></button>
    </div>

    <p v-if="tasksStore.loading" class="loading">Loading…</p>

    <template v-else>
      <label v-if="isNarrowViewport" class="kanban-mobile-switcher">
        View
        <select v-model="mobileActiveStatus">
          <option v-for="status in COLUMN_STATUSES" :key="status" :value="status">
            {{ STATUS_LABELS[status] }} ({{ columnLists[status].length }})
          </option>
        </select>
      </label>

      <div class="kanban-board">
        <div v-for="status in visibleColumnStatuses" :key="status" class="kanban-column">
        <header class="kanban-column-header">
          <span class="kanban-dot" :class="'dot-' + status"></span>
          <h2 class="kanban-column-title">{{ STATUS_LABELS[status] }}</h2>
          <span class="kanban-column-count">{{ columnLists[status].length }}</span>
        </header>
        <p class="kanban-column-hint">{{ STATUS_HINTS[status] }}</p>

        <draggable
          v-model="columnLists[status]"
          :group="'kanban-' + status"
          item-key="id"
          tag="div"
          class="kanban-drop-zone"
          ghost-class="kanban-ghost"
          drag-class="kanban-dragging"
          filter=".quick-complete, .quick-delete"
          :prevent-on-filter="false"
          :animation="150"
          @change="handleColumnChange(status)"
        >
          <template #item="{ element }">
            <TaskCard
              :task="element"
              :subtasks="element.subtasks"
              :status-label="STATUS_LABELS[element.status]"
              :is-narrow-viewport="isNarrowViewport"
              :style="{ animationDelay: taskCardDelay(element) }"
              @edit="openEdit(element)"
              @quick-complete="handleQuickComplete(element, $event)"
              @quick-reopen="handleQuickReopen(element, $event)"
              @quick-delete="handleQuickDelete(element, $event)"
              @edit-subtask="handleEditSubtask"
              @toggle-subtask-done="handleToggleSubtaskDone"
              @update-subtask-priority="handleUpdateSubtaskPriority"
              @update-tags="handleUpdateTags"
            />
          </template>
        </draggable>

        <p v-if="columnLists[status].length === 0" class="kanban-empty">No tasks</p>

        <button v-if="status === 'Backlog'" type="button" class="kanban-add-btn" @click="openAdd()">
          <Plus :size="13" /> Add task
        </button>
      </div>
      </div>
    </template>

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
  position: relative;
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

.filter-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bad);
  border: 1.5px solid var(--bg);
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

.search-control {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--mute);
  transition: border-color 0.16s;
}

.search-control:focus-within,
.search-control.active {
  border-color: var(--accent);
  color: var(--accent);
}

.search-control input {
  border: none;
  background: none;
  outline: none;
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
  width: 130px;
}

.header-actions-mobile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.mobile-icon-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.icon-btn.active {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}

.icon-btn.add-icon-btn {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}

.mobile-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-search-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
}

.mobile-sort-control {
  width: 100%;
}

.mobile-sort-control select {
  flex: 1;
}

.kanban-mobile-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mute);
  margin-bottom: 16px;
}

.kanban-mobile-switcher select {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
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

.loading {
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

.kanban-board {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  overflow-x: auto;
  /* Room for TaskCard's quick-delete badge, which deliberately pokes 7-8px
     outside the card (right: -8px) - harmless in the old CSS grid, but the
     last column now sits flush against this scroll container's edge, so
     without this the poke itself counted as overflow and tripped the
     scrollbar for no visible reason. Padding (not content) absorbs it. */
  padding: 0 12px 8px 0;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  /* 4 equal columns sharing the board's 3 gaps - an exact percentage split
     rather than flex-grow, which can overshoot the container by a pixel or
     two (gap/box-sizing rounding) and trip overflow-x:auto for no reason. */
  flex: 1 1 calc(25% - 12px);
  min-width: 280px;
}

.kanban-column-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kanban-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mute);
}

.kanban-dot.dot-Backlog {
  background: var(--mute);
}

.kanban-dot.dot-Ready {
  background: var(--warn);
}

.kanban-dot.dot-InProgress {
  background: var(--accent);
}

.kanban-dot.dot-Done {
  background: var(--ok);
}

.kanban-column-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.kanban-column-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--mute);
  margin-left: auto;
}

.kanban-column-hint {
  font-size: 11px;
  color: var(--mute);
  margin: 3px 0 14px;
}

.kanban-drop-zone {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 40px;
}

.kanban-ghost {
  opacity: 0.4;
}

.kanban-dragging {
  cursor: grabbing;
}

.kanban-empty {
  font-size: 12px;
  color: var(--mute);
  opacity: 0.7;
  padding: 8px 0;
}

.kanban-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px;
  border-radius: var(--r);
  border: 1px dashed var(--line-2);
  background: transparent;
  color: var(--mute);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.kanban-add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
