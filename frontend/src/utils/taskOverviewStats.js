import { realMinutesForTask } from './taskStats'

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
    estimatedMinutes += task.estimatedMinutes
    realMinutes += real
  }

  if (estimatedMinutes === 0) return null

  return {
    estimatedMinutes,
    realMinutes,
    diffPercent: ((realMinutes - estimatedMinutes) / estimatedMinutes) * 100,
  }
}
