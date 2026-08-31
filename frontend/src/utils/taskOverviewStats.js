import { realMinutesForTask } from './taskStats'

export function taskCountsByStatus(tasks) {
  return {
    open: tasks.filter((t) => t.status === 'Open').length,
    inProgress: tasks.filter((t) => t.status === 'InProgress').length,
    done: tasks.filter((t) => t.status === 'Done').length,
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
