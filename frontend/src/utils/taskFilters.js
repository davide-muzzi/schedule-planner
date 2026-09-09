import { isOverdue } from './taskStats'

const STATUS_LABELS = { Backlog: 'Backlog', Ready: 'Ready', InProgress: 'In Progress', Done: 'Done' }

// Each category is single-select with an "all" option meaning that category
// imposes no restriction - a task only has to clear every category to show.
// Shared between the Tasks board's own filter button and the subtask picker
// modal, so both filter identically rather than drifting apart.
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
]

// Tags is data-driven (the tag catalog changes at runtime), so it's built
// fresh from the caller's own tags list rather than baked into the base set.
export function buildTaskFilterCategories(tags) {
  return [
    ...BASE_FILTER_CATEGORIES,
    {
      key: 'tags',
      label: 'Tags',
      // Multiple tags selected here is an AND, not an OR - see taskMatchesFilters.
      multiSelect: true,
      options: [{ value: 'all', label: 'All' }, ...tags.map((t) => ({ value: String(t.id), label: t.name }))],
    },
  ]
}

export function defaultTaskFilters(categories) {
  const result = {}
  for (const category of categories) {
    result[category.key] = category.multiSelect ? [] : 'all'
  }
  return result
}

export function taskMatchesFilters(task, filters, searchQuery = '') {
  const f = filters || {}
  if ((f.status ?? 'all') !== 'all' && task.status !== f.status) return false
  if ((f.priority ?? 'all') !== 'all' && task.priority !== f.priority) return false
  if ((f.overdue ?? 'all') === 'yes' && !isOverdue(task)) return false
  // AND, not OR - a task has to carry every selected tag, not just one of them.
  const selectedTags = Array.isArray(f.tags) ? f.tags : []
  if (selectedTags.length > 0) {
    const taskTagIds = new Set((task.tags || []).map((t) => String(t.id)))
    if (!selectedTags.every((id) => taskTagIds.has(id))) return false
  }
  const q = searchQuery.trim().toLowerCase()
  if (q && !task.name.toLowerCase().includes(q) && !String(task.id).includes(q)) return false
  return true
}
