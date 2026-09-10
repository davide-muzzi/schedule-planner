// Two entries are merge candidates when they're back-to-back on the same
// day with the same linked task - same date, same non-null taskItemId (only
// Working entries can have one, so entryType always matches too), neither
// all-day, and one's end time lands exactly on the other's start time. An
// exact touch rather than any gap, since overlap is already rejected
// elsewhere - "neighbouring" here means zero gap, not "close".
export function entriesAreMergeable(a, b) {
  return (
    !a.allDay &&
    !b.allDay &&
    a.date === b.date &&
    a.taskItemId != null &&
    a.taskItemId === b.taskItemId &&
    a.entryType === b.entryType &&
    (a.endTime === b.startTime || b.endTime === a.startTime)
  )
}

// The combined entry two mergeable entries collapse into - spans both time
// ranges, keeps whichever title/work location is set (the just-saved side
// wins a real conflict), and concatenates notes instead of dropping either.
export function mergedEntryPayload(a, b) {
  const notesA = (a.notes || '').trim()
  const notesB = (b.notes || '').trim()
  const notes = !notesA ? notesB || null : !notesB || notesA === notesB ? notesA : `${notesA}\n${notesB}`
  return {
    title: (a.title || '').trim() || (b.title || '').trim() || null,
    date: a.date,
    allDay: false,
    startTime: a.startTime < b.startTime ? a.startTime : b.startTime,
    endTime: a.endTime > b.endTime ? a.endTime : b.endTime,
    entryType: a.entryType,
    workLocation: a.workLocation || b.workLocation || null,
    taskItemId: a.taskItemId,
    notes,
  }
}
