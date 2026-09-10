<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Plus, X, SlidersHorizontal, Tags, Search, ListSortAscending, ListSortDescending } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import { useAppShell } from '@/composables/useAppShell'
import { subtasksOf, deriveTaskStatus, taskUpdatePayload, enrichTaskForDetail } from '@/utils/taskStats'
import {
  buildTaskFilterCategories,
  taskMatchesFilters,
  activeFilterCount as computeActiveFilterCount,
  DATE_FILTER_FIELDS,
  defaultDateFilter,
} from '@/utils/taskFilters'
import { showToast } from '@/utils/toast'
import TaskFormModal from '@/components/TaskFormModal.vue'
import TaskFilterModal from '@/components/TaskFilterModal.vue'
import TaskCard from '@/components/TaskCard.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
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
  { value: 'priority', label: 'Priority' },
  { value: 'createdAt', label: 'Created' },
  { value: 'lastUpdatedAt', label: 'Last updated' },
]
// Most urgent first - same severity ordering used for the priority
// donut/chart on the Overview page.
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2, None: 3 }
const SORT_STORAGE_KEY = 'schedulePlanner.taskSortBy'
const SORT_REVERSED_STORAGE_KEY = 'schedulePlanner.taskSortReversed'

const FILTERS_STORAGE_KEY = 'schedulePlanner.taskFilters'

function loadSortBy() {
  const stored = localStorage.getItem(SORT_STORAGE_KEY)
  return SORT_OPTIONS.some((o) => o.value === stored) ? stored : 'id'
}

function loadSortReversed() {
  return localStorage.getItem(SORT_REVERSED_STORAGE_KEY) === 'true'
}

const scheduleStore = useScheduleStore()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const { isNarrowViewport } = useAppShell()

const FILTER_CATEGORIES = computed(() => buildTaskFilterCategories(tagsStore.tags))

// Sanity-checks a stored dateFilter blob before trusting it (localStorage
// content could predate this field, or just be corrupted) - anything that
// doesn't look right falls back to "no date filter" rather than throwing.
function validDateFilter(raw) {
  if (!raw || typeof raw !== 'object') return null
  const fieldOk = raw.field === '' || DATE_FILTER_FIELDS.some((f) => f.value === raw.field)
  const comparisonOk = ['before', 'on', 'after'].includes(raw.comparison)
  if (!fieldOk || !comparisonOk || typeof raw.value !== 'string') return null
  return { field: raw.field, comparison: raw.comparison, value: raw.value }
}

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
      result[category.key] = category.default ?? 'all'
    }
  }
  if (!('dateFilter' in result)) {
    result.dateFilter = validDateFilter(stored?.dateFilter) ?? defaultDateFilter()
  }
  return result
}

const sortBy = ref(loadSortBy())
watch(sortBy, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

// One toggle that flips whichever sort is currently active, rather than a
// separate Asc/Desc entry per field in SORT_OPTIONS above.
const sortReversed = ref(loadSortReversed())
watch(sortReversed, (value) => localStorage.setItem(SORT_REVERSED_STORAGE_KEY, String(value)))
function toggleSortReversed() {
  sortReversed.value = !sortReversed.value
}

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
const activeFilterCount = computed(() => computeActiveFilterCount(FILTER_CATEGORIES.value, filters.value))

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
  return enrichTaskForDetail(task, tasksStore.tasks, scheduleStore.entries)
}

// Each non-id ordering is ascending, per-field, with id as the tiebreaker.
// dueDate is a "YYYY-MM-DD" string (or null) - plain string comparison
// already sorts it chronologically; tasks with no due date always sort
// after every dated one, regardless of which field is active. priority uses
// PRIORITY_RANK so High sorts first (severity, not alphabetical). Used to
// order every column's cards (see columnLists below).
function compareTasksAscending(a, b) {
  if (sortBy.value === 'name') return a.name.localeCompare(b.name) || a.id - b.id
  if (sortBy.value === 'dueDate') {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || a.id - b.id
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.id - b.id
  }
  if (sortBy.value === 'priority') {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id - b.id
  }
  // createdAt/lastUpdatedAt are full ISO datetime strings - plain string
  // comparison already sorts them chronologically, same as dueDate above.
  if (sortBy.value === 'createdAt') return a.createdAt.localeCompare(b.createdAt) || a.id - b.id
  if (sortBy.value === 'lastUpdatedAt') return a.lastUpdatedAt.localeCompare(b.lastUpdatedAt) || a.id - b.id
  return a.id - b.id
}

// One shared reversal (see sortReversed above) instead of a separate Asc/Desc
// pair per field - flips the whole comparison, tiebreakers included, which
// is simpler to reason about than reversing only the primary key.
function compareTasks(a, b) {
  const result = compareTasksAscending(a, b)
  return sortReversed.value ? -result : result
}

function matchesFilters(task) {
  return taskMatchesFilters(task, filters.value, searchQuery.value)
}

// Subtasks never appear as their own top-level cards - they render nested
// inside their Group's card instead (see TaskCard's subtask-preview).
const taskCards = computed(() =>
  tasksStore.tasks.filter((t) => t.parentTaskId == null).filter(matchesFilters).map(taskCard),
)

// --- Kanban board: per-column lists ---
// No manual reordering (drag-and-drop) any more - each column is just its
// matching cards in the live sort order. Old Done tasks are already
// excluded upstream by taskCards (the "doneAge" filter, on by default - see
// taskFilters.js), not handled specially here.
const columnLists = computed(() => {
  const result = {}
  for (const status of COLUMN_STATUSES) {
    result[status] = taskCards.value.filter((t) => t.status === status).sort(compareTasks)
  }
  return result
})

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

const detailTaskId = ref(null)

// Looked up live (not a snapshot) rather than storing the task object
// itself, so edits/completions made elsewhere - or from inside the detail
// modal itself, e.g. deleting a subtask it's showing - show up immediately
// without having to close and reopen it.
const detailTask = computed(() => {
  if (detailTaskId.value == null) return null
  return taskCards.value.find((t) => t.id === detailTaskId.value) ?? tasksStore.tasks.find((t) => t.id === detailTaskId.value) ?? null
})

function openDetail(task) {
  detailTaskId.value = task.id
}

function closeDetail() {
  detailTaskId.value = null
}

function handleDetailEdit(task) {
  detailTaskId.value = null
  openEdit(task)
}

// Removes a subtask from its group without opening the group's own edit
// form - same "keep as standalone task" outcome TaskFormModal's per-subtask
// remove button already offers, just reachable from the subtask's own
// detail view too (including nested, when opened from inside its group's).
// The detail modal(s) don't need to be told to close anything here - their
// own subtasks-list watcher already does that once parentTaskId changes.
async function handleDetailUnlink(id) {
  const task = tasksStore.tasks.find((t) => t.id === id)
  if (!task) return
  saving.value = true
  try {
    const status = task.status === 'Done' ? 'Done' : 'Backlog'
    await tasksStore.updateTask(id, taskUpdatePayload(task, { parentTaskId: null, status }))
    showToast('Removed from group - kept as a standalone task.')
  } catch {
    showToast(tasksStore.error || "Couldn't unlink that task.")
  } finally {
    saving.value = false
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
        <button
          type="button"
          class="sort-reverse-btn"
          :title="sortReversed ? 'Descending - click for ascending' : 'Ascending - click for descending'"
          :aria-label="sortReversed ? 'Sort descending, click to sort ascending' : 'Sort ascending, click to sort descending'"
          @click="toggleSortReversed"
        >
          <component :is="sortReversed ? ListSortDescending : ListSortAscending" :size="15" />
        </button>
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

        <div class="mobile-sort-row">
          <label class="sort-control mobile-sort-control">
            Sort by
            <select v-model="sortBy">
              <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button
            type="button"
            class="sort-reverse-btn"
            :title="sortReversed ? 'Descending - click for ascending' : 'Ascending - click for descending'"
            :aria-label="sortReversed ? 'Sort descending, click to sort ascending' : 'Sort ascending, click to sort descending'"
            @click="toggleSortReversed"
          >
            <component :is="sortReversed ? ListSortDescending : ListSortAscending" :size="15" />
          </button>
        </div>
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

      <div class="kanban-board" :class="{ 'kanban-board-single': isNarrowViewport }">
        <div v-for="status in visibleColumnStatuses" :key="status" class="kanban-column">
        <template v-if="!isNarrowViewport">
        <header class="kanban-column-header">
          <span class="kanban-dot" :class="'dot-' + status"></span>
          <h2 class="kanban-column-title">{{ STATUS_LABELS[status] }}</h2>
          <span class="kanban-column-count">{{ columnLists[status].length }}</span>
        </header>
        <p class="kanban-column-hint">{{ STATUS_HINTS[status] }}</p>
        </template>

        <div class="kanban-drop-zone">
          <TaskCard
            v-for="element in columnLists[status]"
            :key="element.id"
            :task="element"
            :subtasks="element.subtasks"
            :is-narrow-viewport="isNarrowViewport"
            :style="{ animationDelay: taskCardDelay(element) }"
            @edit="openEdit(element)"
            @quick-complete="handleQuickComplete(element, $event)"
            @quick-reopen="handleQuickReopen(element, $event)"
            @quick-delete="handleQuickDelete(element, $event)"
            @expand="openDetail(element)"
            @expand-subtask="openDetail"
            @edit-subtask="handleEditSubtask"
            @toggle-subtask-done="handleToggleSubtaskDone"
            @update-subtask-priority="handleUpdateSubtaskPriority"
            @update-tags="handleUpdateTags"
          />
        </div>

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

    <TaskDetailModal
      v-if="detailTask"
      :task="detailTask"
      :subtasks="detailTask.subtasks || []"
      @close="closeDetail"
      @edit="handleDetailEdit"
      @delete="requestDelete"
      @unlink="handleDetailUnlink"
    />

    <TaskFilterModal
      v-if="showFilterModal"
      :categories="FILTER_CATEGORIES"
      :model-value="filters"
      :tags="tagsStore.tags"
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
  display: flex;
  flex-direction: column;
  /* Fills .shell-main's own (definite, since it comes from .shell's
     height:100vh via flexbox) height - this is what lets the board below
     be capped to "whatever's left" instead of growing forever, pushing the
     scroll down into each column individually rather than the whole page. */
  height: 100%;
  min-height: 0;
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

.sort-reverse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--dim);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.sort-reverse-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mobile-sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
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
  flex: 1;
  min-width: 0;
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
  /* Each column now stretches to the board's own (flexed, bounded) height
     instead of only ever being as tall as its own cards - see
     .kanban-drop-zone, the part of a column that actually scrolls. */
  align-items: stretch;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  /* Room for TaskCard's quick-delete badge, which deliberately pokes 7-8px
     outside the card (right: -8px) - harmless in the old CSS grid, but the
     last column now sits flush against this scroll container's edge, so
     without this the poke itself counted as overflow and tripped the
     scrollbar for no visible reason. Only as much as the poke actually
     needs, and only on the right (it never pokes left) - no reason to
     shrink the usable card width on both sides for a one-sided badge. */
  padding: 0 8px 8px 0;
}

/* On mobile there's only ever one column (visibleColumnStatuses), which
   already stretches to fill the board's full width with no horizontal
   overflow ever possible - the board's own right padding above exists
   purely to protect the *last* of several side-by-side columns from the
   board's horizontal scrollbar, which doesn't apply here. Left on, it just
   stacks on top of .kanban-drop-zone's own right padding (needed either
   way, for that column's vertical scrollbar) and visibly shifts the cards
   left of where the header controls above them line up. */
.kanban-board-single {
  padding-right: 0;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  /* 4 equal columns sharing the board's 3 gaps - an exact percentage split
     rather than flex-grow, which can overshoot the container by a pixel or
     two (gap/box-sizing rounding) and trip overflow-x:auto for no reason. */
  flex: 1 1 calc(25% - 12px);
  min-width: 280px;
  min-height: 0;
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
  font-size: 11.5px;
  font-weight: 600;
  color: var(--fg);
  background: var(--surface2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: auto;
}

.kanban-column-hint {
  font-size: 11px;
  color: var(--mute);
  margin: 3px 0 10px;
}

.kanban-drop-zone {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* This is the part of a column that actually scrolls - the header, hint,
     and "Add task" button below all stay put (see .kanban-column). */
  flex: 1;
  min-height: 40px;
  overflow-y: auto;
  /* Setting overflow-y here makes overflow-x resolve to non-visible too
     (per the CSS Overflow spec), so it needs the same quick-delete-badge
     headroom .kanban-board's own padding comment explains above - every
     card's badge pokes -8px top/right of its own box, not just the last
     column's edge, once each column is its own scroll boundary. Only on
     the right (it never pokes left) - see .kanban-board's own comment. */
  padding: 8px 8px 8px 0;
}

.kanban-empty {
  font-size: 12px;
  color: var(--mute);
  opacity: 0.7;
  padding: 8px 0;
  text-align: center;
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
