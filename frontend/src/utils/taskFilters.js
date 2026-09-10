import { isOverdue } from './taskStats'

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }

// A Done task older than this is hidden by the "doneAge" category below,
// unless that category is explicitly set to "all" - see its own comment.
export const HIDE_DONE_AFTER_DAYS = 30

function daysSinceCompleted(task) {
  if (!task.completedAt) return 0
  return (Date.now() - new Date(task.completedAt).getTime()) / 86400000
}

// A sentinel inside the (otherwise tag-id) `tags` selection array, meaning
// "tasks with zero tags" - mutually exclusive with actual tag ids (picking
// this clears any selected tags and vice versa, since "has tag X" and "has
// no tags" can never both be true), handled by the picker UI, not here.
export const NO_TAGS_SENTINEL = '__none__'

// Each category is single-select with a default option (usually "all",
// meaning no restriction) unless it sets `multiSelect: true` (tags), in
// which case its value is an array instead of a single one, "all" means the
// array is empty, and multiple selections are AND'd (must match every one),
// not OR'd - see taskMatchesFilters. Categories are data-driven so a new one
// is just another entry here, not a new component - shared between the
// Tasks board's own filter button and the subtask/task-link picker modals,
// so all three filter (and default) identically rather than drifting apart.
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
  {
    key: 'overdue',
    label: 'Overdue',
    options: [
      { value: 'all', label: 'All' },
      { value: 'yes', label: 'Overdue only' },
    ],
  },
  // Unlike every other category here, this one's neutral/default state is
  // NOT "all" - old Done tasks pile up forever otherwise, so hiding them is
  // the default, with "Show all" as the deliberate opt-in. See `default`
  // below, which defaultTaskFilters/activeFilterCount both respect instead
  // of assuming "all" the way they do for every other category.
  {
    key: 'doneAge',
    label: 'Done tasks',
    default: 'hideOld',
    options: [
      { value: 'hideOld', label: `Hide old (${HIDE_DONE_AFTER_DAYS}+ days)` },
      { value: 'all', label: 'Show all' },
    ],
  },
]

// Tags is data-driven (the tag catalog changes at runtime), so it's built
// fresh from the caller's own tags list rather than baked into the base
// set. `picker: true` tells TaskFilterModal to render this one as a
// summary button opening TagFilterPickerModal instead of an inline pill
// row - a task's tag list can get long enough that the old inline row
// became unusable.
export function buildTaskFilterCategories(tags) {
  return [
    ...BASE_FILTER_CATEGORIES,
    {
      key: 'tags',
      label: 'Tags',
      multiSelect: true,
      picker: true,
      options: [
        { value: 'all', label: 'All' },
        { value: NO_TAGS_SENTINEL, label: 'None' },
        ...tags.map((t) => ({ value: String(t.id), label: t.name })),
      ],
    },
  ]
}

// The four date fields a task carries that a "Before/On/After" filter can
// compare against - dueDate is a plain "YYYY-MM-DD" (DateOnly), the other
// three are full DateTime ISO strings; calendarDateOf below normalizes both
// to a bare calendar date so the comparison never cares about time-of-day.
export const DATE_FILTER_FIELDS = [
  { value: 'dueDate', label: 'Due date' },
  { value: 'createdAt', label: 'Created' },
  { value: 'completedAt', label: 'Completed' },
  { value: 'lastUpdatedAt', label: 'Last updated' },
]

export function defaultDateFilter() {
  return { field: '', comparison: 'on', value: '' }
}

function calendarDateOf(value) {
  return value ? value.slice(0, 10) : null
}

function dateFilterMatches(task, dateFilter) {
  if (!dateFilter || !dateFilter.field || !dateFilter.value) return true
  const taskDate = calendarDateOf(task[dateFilter.field])
  if (!taskDate) return false // the field's simply unset on this task (e.g. no due date, never completed)
  if (dateFilter.comparison === 'before') return taskDate < dateFilter.value
  if (dateFilter.comparison === 'after') return taskDate > dateFilter.value
  return taskDate === dateFilter.value // 'on'
}

// dateFilter isn't one of `categories` (it's a field+comparison+value combo,
// not a simple option list), so it's seeded here directly rather than via
// the loop below, but every category (including ones with a non-"all"
// default, like doneAge) is handled uniformly through its own `default`.
export function defaultTaskFilters(categories) {
  const result = { dateFilter: defaultDateFilter() }
  for (const category of categories) {
    result[category.key] = category.multiSelect ? [] : (category.default ?? 'all')
  }
  return result
}

// How many of `filters` currently narrow anything beyond that category's
// own default - shared by every "Filters (N)" button so they all count
// identically instead of three near-copies of this same loop drifting apart.
export function activeFilterCount(categories, filters) {
  const f = filters || {}
  let count = categories.filter((c) => {
    const v = f[c.key]
    if (c.multiSelect) return Array.isArray(v) && v.length > 0
    return (v ?? c.default ?? 'all') !== (c.default ?? 'all')
  }).length
  if (f.dateFilter?.field && f.dateFilter?.value) count += 1
  return count
}

export function taskMatchesFilters(task, filters, searchQuery = '') {
  const f = filters || {}
  if ((f.status ?? 'all') !== 'all' && task.status !== f.status) return false
  if ((f.priority ?? 'all') !== 'all' && task.priority !== f.priority) return false
  if ((f.overdue ?? 'all') === 'yes' && !isOverdue(task)) return false
  if ((f.doneAge ?? 'hideOld') === 'hideOld' && task.status === 'Done' && daysSinceCompleted(task) > HIDE_DONE_AFTER_DAYS) {
    return false
  }

  const selectedTags = Array.isArray(f.tags) ? f.tags : []
  if (selectedTags.includes(NO_TAGS_SENTINEL)) {
    if ((task.tags || []).length > 0) return false
  } else if (selectedTags.length > 0) {
    // AND, not OR - a task has to carry every selected tag, not just one of them.
    const taskTagIds = new Set((task.tags || []).map((t) => String(t.id)))
    if (!selectedTags.every((id) => taskTagIds.has(id))) return false
  }

  if (!dateFilterMatches(task, f.dateFilter)) return false

  const q = searchQuery.trim().toLowerCase()
  if (q && !task.name.toLowerCase().includes(q) && !String(task.id).includes(q)) return false
  return true
}
