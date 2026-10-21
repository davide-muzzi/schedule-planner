// Priority-list task sorting: an ordered list of levels, each a field plus a
// direction. Every task belongs to exactly one level - the first one that
// applies to it (Due date only applies to tasks with a due date, Priority
// only to tasks with a priority other than None, the rest to every task) -
// and is sorted only by that level's field. The resulting groups are stacked
// in level order; tasks no level applies to come last. Ties (and that last
// group) go by task id, so the order is fully deterministic.
//
// e.g. Due date -> Priority -> Last updated: dated tasks first by date, then
// the undated ones that have a priority by priority, then the rest by last
// update. Any level below an `always` field (one that applies to every
// task) can never receive a task - it's kept but shown as inactive.

// Most urgent first - same severity ordering used for the priority
// donut/chart on the Overview page.
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }

export const SORT_FIELDS = [
  {
    value: 'dueDate',
    label: 'Due date',
    always: false,
    dirLabels: { asc: 'Earliest first', desc: 'Latest first' },
    // "YYYY-MM-DD" string or null - plain string comparison is chronological.
    applies: (t) => !!t.dueDate,
    compare: (a, b) => a.dueDate.localeCompare(b.dueDate),
  },
  {
    value: 'priority',
    label: 'Priority',
    always: false,
    dirLabels: { asc: 'High first', desc: 'Low first' },
    applies: (t) => t.priority in PRIORITY_RANK,
    compare: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  },
  {
    value: 'name',
    label: 'Alphabetical',
    always: true,
    dirLabels: { asc: 'A → Z', desc: 'Z → A' },
    applies: () => true,
    compare: (a, b) => a.name.localeCompare(b.name),
  },
  {
    value: 'lastUpdatedAt',
    label: 'Last updated',
    always: true,
    dirLabels: { asc: 'Oldest first', desc: 'Newest first' },
    // Full ISO datetime strings - plain string comparison is chronological.
    applies: () => true,
    compare: (a, b) => a.lastUpdatedAt.localeCompare(b.lastUpdatedAt),
  },
  {
    value: 'createdAt',
    label: 'Created',
    always: true,
    dirLabels: { asc: 'Oldest first', desc: 'Newest first' },
    applies: () => true,
    compare: (a, b) => a.createdAt.localeCompare(b.createdAt),
  },
  {
    value: 'id',
    label: 'ID',
    always: true,
    dirLabels: { asc: 'Lowest first', desc: 'Highest first' },
    applies: () => true,
    compare: (a, b) => a.id - b.id,
  },
]

const FIELDS_BY_VALUE = Object.fromEntries(SORT_FIELDS.map((f) => [f.value, f]))

export function sortField(value) {
  return FIELDS_BY_VALUE[value]
}

// Newest-first is the natural starting direction for timestamps,
// ascending for everything else.
export function defaultSortDir(fieldValue) {
  return fieldValue === 'lastUpdatedAt' || fieldValue === 'createdAt' ? 'desc' : 'asc'
}

export function defaultSortLevels() {
  return [
    { field: 'dueDate', dir: 'asc' },
    { field: 'priority', dir: 'asc' },
    { field: 'lastUpdatedAt', dir: 'desc' },
  ]
}

// Sanity-checks a stored/edited level list: drops unknown fields, bad
// directions and duplicates. Anything that isn't a list at all falls back to
// the defaults; an empty list is valid (plain id order).
export function normalizeSortLevels(raw) {
  if (!Array.isArray(raw)) return defaultSortLevels()
  const seen = new Set()
  const result = []
  for (const level of raw) {
    const field = level && FIELDS_BY_VALUE[level.field]
    if (!field || seen.has(field.value)) continue
    seen.add(field.value)
    result.push({ field: field.value, dir: level.dir === 'desc' ? 'desc' : 'asc' })
  }
  return result
}

// Index of the first level that can never receive a task (everything after
// the first `always` level), or levels.length if all of them can.
export function firstInactiveLevelIndex(levels) {
  const i = levels.findIndex((l) => FIELDS_BY_VALUE[l.field].always)
  return i === -1 ? levels.length : i + 1
}

function levelIndexFor(levels, task) {
  const i = levels.findIndex((l) => FIELDS_BY_VALUE[l.field].applies(task))
  return i === -1 ? levels.length : i
}

export function compareTasksByLevels(levels, a, b) {
  const ia = levelIndexFor(levels, a)
  const ib = levelIndexFor(levels, b)
  if (ia !== ib) return ia - ib
  if (ia < levels.length) {
    const level = levels[ia]
    const result = FIELDS_BY_VALUE[level.field].compare(a, b)
    if (result !== 0) return level.dir === 'desc' ? -result : result
  }
  return a.id - b.id
}
