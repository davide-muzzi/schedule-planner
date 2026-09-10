import { realMinutesForTask, plannedMinutesForGroup } from './taskStats'
import { getMonday } from './date'

// Every card on the Tasks board is one countable "task" - a standalone task
// or a Group. Subtasks live inside a card rather than being cards of their
// own, so both breakdowns below only look at top-level items
// (parentTaskId == null).
function topLevelTasks(tasks) {
  return tasks.filter((t) => t.parentTaskId == null)
}

export function taskCountsByStatus(tasks) {
  const cards = topLevelTasks(tasks)
  return {
    backlog: cards.filter((t) => t.status === 'Backlog').length,
    ready: cards.filter((t) => t.status === 'Ready').length,
    inProgress: cards.filter((t) => t.status === 'InProgress').length,
    done: cards.filter((t) => t.status === 'Done').length,
  }
}

export function taskCountsByPriority(tasks) {
  const cards = topLevelTasks(tasks)
  return {
    none: cards.filter((t) => (t.priority ?? 'None') === 'None').length,
    low: cards.filter((t) => t.priority === 'Low').length,
    medium: cards.filter((t) => t.priority === 'Medium').length,
    high: cards.filter((t) => t.priority === 'High').length,
  }
}

// Cards (not their subtasks - a Group's own real time comes only from
// entries linked directly to the Group itself, same as everywhere else real
// minutes are computed) with a due date in the past that aren't Done yet.
export function overdueTaskCount(tasks) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return topLevelTasks(tasks).filter(
    (t) => t.dueDate && t.status !== 'Done' && new Date(`${t.dueDate}T00:00:00`) < today,
  ).length
}

// Monday 00:00 of the current week - same week-start convention as
// everywhere else in this app (WeekSummary, weekly balance, etc.).
function startOfThisWeek() {
  const monday = getMonday(new Date())
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function tasksCreatedThisWeek(tasks) {
  const since = startOfThisWeek()
  return topLevelTasks(tasks).filter((t) => t.createdAt && new Date(t.createdAt) >= since).length
}

export function tasksCompletedThisWeek(tasks) {
  const since = startOfThisWeek()
  return topLevelTasks(tasks).filter((t) => t.completedAt && new Date(t.completedAt) >= since).length
}

const PRIORITY_SEVERITY_ORDER = ['High', 'Medium', 'Low', 'None']

// Real tracked hours grouped by task priority, same shape/sort convention as
// overviewStats.js's timeBreakdownByType - descending by hours, zero-hour
// priorities dropped rather than shown as empty bar segments.
export function taskTimeByPriority(tasks, entries) {
  const totals = { High: 0, Medium: 0, Low: 0, None: 0 }
  for (const task of topLevelTasks(tasks)) {
    const priority = task.priority ?? 'None'
    totals[priority] += realMinutesForTask(entries, task.id) / 60
  }

  const grandTotal = Object.values(totals).reduce((sum, h) => sum + h, 0)
  return PRIORITY_SEVERITY_ORDER.map((priority) => ({
    priority,
    hours: totals[priority],
    pct: grandTotal > 0 ? (totals[priority] / grandTotal) * 100 : 0,
  }))
    .filter((p) => p.hours > 0.001)
    .sort((a, b) => b.hours - a.hours)
}

// Aggregate estimated-vs-real accuracy across every task with at least some
// real time logged against it. Tasks nobody's started yet are excluded
// entirely rather than counted as "100% under" - otherwise a pile of
// not-yet-started tasks would drag the average toward looking better than
// your actual estimating has been. Returns null when there's nothing to
// aggregate yet (no task has been worked on).
export function taskEstimateAccuracy(tasks, entries) {
  let estimatedMinutes = 0
  let realMinutes = 0

  for (const task of tasks) {
    const real = realMinutesForTask(entries, task.id)
    if (real <= 0) continue
    // A Group's own estimatedMinutes is always 0 server-side - its real
    // estimate is the live sum of its subtasks (see plannedMinutesForGroup).
    // Using the raw 0 here would inject a phantom diff for any Group with
    // real time logged directly against it.
    estimatedMinutes += task.taskType === 'Group' ? plannedMinutesForGroup(tasks, task.id) : task.estimatedMinutes
    realMinutes += real
  }

  if (estimatedMinutes === 0) return null

  return {
    estimatedMinutes,
    realMinutes,
    diffPercent: ((realMinutes - estimatedMinutes) / estimatedMinutes) * 100,
  }
}
