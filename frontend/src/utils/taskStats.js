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
// null if it has none - used to decide when a Backlog/Ready task should
// flip to In Progress.
export function earliestLinkedEntryDateTime(entries, taskId) {
  const linked = linkedWorkingEntries(entries, taskId)
  if (linked.length === 0) return null
  return linked
    .map((e) => new Date(`${e.date}T${e.startTime}`))
    .reduce((earliest, d) => (d < earliest ? d : earliest))
}

// Whether a task is linked to any planner entry at all - deliberately not
// restricted to timed Working entries (unlike earliestLinkedEntryDateTime)
// since an all-day Working entry still counts as "linked", it just has no
// clock time to compare against "now".
function isTaskLinked(entries, taskId) {
  return entries.some((e) => e.taskItemId === taskId)
}

// A task's Backlog/Ready/InProgress status is never set directly - it's
// always derived from whether (and when) it's linked to a planner entry.
// Done is the one exception, handled entirely by the caller: this never
// returns it, and callers should skip already-Done tasks before using this.
export function deriveTaskStatus(entries, taskId) {
  if (!isTaskLinked(entries, taskId)) return 'Backlog'
  const earliest = earliestLinkedEntryDateTime(entries, taskId)
  if (earliest !== null && earliest <= new Date()) return 'InProgress'
  // Also covers a task linked only to an all-day entry (earliest === null) -
  // no clock time to compare, so it just sits at Ready until marked Done.
  return 'Ready'
}

// Builds a full TaskItemDto-shaped PUT payload from a task object as
// returned by the API (which carries `tags` as full objects, not the
// `tagIds` the write DTO expects) plus any field overrides. Every PUT is a
// full overwrite, so spreading a raw task directly would silently wipe its
// tags - the backend defaults a missing `tagIds` to none.
export function taskUpdatePayload(task, overrides = {}) {
  return {
    name: task.name,
    // A Group's estimatedMinutes is never set directly - it's always 0
    // server-side, with "planned time" being the live sum of its subtasks.
    estimatedMinutes: task.taskType === 'Group' ? 0 : task.estimatedMinutes,
    status: task.status,
    priority: task.priority ?? 'None',
    taskType: task.taskType,
    parentTaskId: task.parentTaskId ?? null,
    tagIds: (task.tags || []).map((t) => t.id),
    color: task.color ?? null,
    dueDate: task.dueDate ?? null,
    notes: task.notes ?? null,
    ...overrides,
  }
}

export function subtasksOf(tasks, groupId) {
  return tasks.filter((t) => t.parentTaskId === groupId)
}

// A task is overdue once its due date has passed and it isn't Done yet -
// used both for the red due-date styling on a task card and the Tasks page
// Overdue filter.
export function isOverdue(task) {
  if (!task.dueDate || task.status === 'Done') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${task.dueDate}T00:00:00`) < today
}

// A Group's planned time isn't set directly - it's always the sum of its
// subtasks' own estimatedMinutes, kept live rather than stored/duplicated
// server-side.
export function plannedMinutesForGroup(tasks, groupId) {
  return subtasksOf(tasks, groupId).reduce((sum, t) => sum + t.estimatedMinutes, 0)
}
