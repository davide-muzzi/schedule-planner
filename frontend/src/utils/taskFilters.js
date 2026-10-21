import { isOverdue } from './taskStats'

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }

// A Done task older than this is hidden by the "doneAge" category below,
// unless that category is explicitly set to "all" - see its own comment.
export const HIDE_DONE_AFTER_DAYS = 30

function daysSinceCompleted(task) {
  if (!task.completedAt) return 0
  return (Date.now() - new Date(task.completedAt).getTime()) / 86400000
}

// Each category is single-select with a default option (usually "all",
// meaning no restriction) unless it sets `multiSelect: true` (tags), in
// which case its value is an array instead of a single one, "all" means the
// array is empty, and how multiple selections combine is up to
// taskMatchesFilters (see the tags category below). Categories are data-driven so a new one
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
// set. It's one filter in the UI - `picker: true` makes TaskFilterModal
// render a summary button opening TagFilterPickerModal (an Include/Exclude
// table) - but three stored values:
//   tags        - included tag ids; a task must carry any one of them
//                 (tagMatch 'any') or all of them (tagMatch 'all')
//   excludeTags - excluded tag ids; carrying any one of them hides a task
//   tagMatch    - 'any' | 'all', how `tags` combines
// The last two are `hidden` (not rendered as their own rows) and listed in
// the tags category's `linkedKeys` so they count as part of it.
export function buildTaskFilterCategories(tags) {
  const tagOptions = [{ value: 'all', label: 'All' }, ...tags.map((t) => ({ value: String(t.id), label: t.name }))]
  return [
    ...BASE_FILTER_CATEGORIES,
    {
      key: 'tags',
      label: 'Tags',
      multiSelect: true,
      picker: true,
      linkedKeys: ['excludeTags'],
      options: tagOptions,
    },
    { key: 'excludeTags', label: 'Excluded tags', multiSelect: true, hidden: true, options: tagOptions },
    {
      key: 'tagMatch',
      label: 'Include match',
      hidden: true,
      default: 'any',
      options: [
        { value: 'any', label: 'Any' },
        { value: 'all', label: 'All' },
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
    if (c.hidden) return false
    const v = f[c.key]
    if (c.multiSelect) {
      return [c.key, ...(c.linkedKeys ?? [])].some((key) => Array.isArray(f[key]) && f[key].length > 0)
    }
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

  const taskTagIds = new Set((task.tags || []).map((t) => String(t.id)))
  const includedTags = Array.isArray(f.tags) ? f.tags : []
  if (includedTags.length > 0) {
    const has = (id) => taskTagIds.has(id)
    if (f.tagMatch === 'all' ? !includedTags.every(has) : !includedTags.some(has)) return false
  }
  const excludedTags = Array.isArray(f.excludeTags) ? f.excludeTags : []
  if (excludedTags.some((id) => taskTagIds.has(id))) return false

  if (!dateFilterMatches(task, f.dateFilter)) return false

  const q = searchQuery.trim().toLowerCase()
  if (q && !task.name.toLowerCase().includes(q) && !String(task.id).includes(q)) return false
  return true
}
