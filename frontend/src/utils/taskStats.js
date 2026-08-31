import { durationHours } from './date'

function linkedWorkingEntries(entries, taskId) {
  return entries.filter((e) => e.taskItemId === taskId && e.entryType === 'Working' && !e.allDay)
}

export function realMinutesForTask(entries, taskId) {
  return linkedWorkingEntries(entries, taskId).reduce(
    (sum, e) => sum + durationHours(e.startTime, e.endTime) * 60,
    0,
  )
}

// The earliest start date/time among a task's linked Working entries, or
// null if it has none - used to decide when an Open task should flip to
// In Progress.
export function earliestLinkedEntryDateTime(entries, taskId) {
  const linked = linkedWorkingEntries(entries, taskId)
  if (linked.length === 0) return null
  return linked
    .map((e) => new Date(`${e.date}T${e.startTime}`))
    .reduce((earliest, d) => (d < earliest ? d : earliest))
}
