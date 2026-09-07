using System.Text.Json.Serialization;

namespace SchedulePlanner.Models;

public class TaskItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Open;
    public TaskItemPriority Priority { get; set; } = TaskItemPriority.None;
    public TaskItemType TaskType { get; set; } = TaskItemType.Task;

    // Set only on a Task (never a Group) to make it a subtask of a Group.
    // One level of nesting only - a Group can never itself have a parent.
    public int? ParentTaskId { get; set; }

    [JsonIgnore]
    public TaskItem? ParentTask { get; set; }

    // Not Include()d anywhere the API returns a TaskItem, so this stays an
    // empty list on every response - excluded from JSON rather than left to
    // serialize as misleadingly-always-empty.
    [JsonIgnore]
    public ICollection<TaskItem> Subtasks { get; set; } = new List<TaskItem>();

    // "#rrggbb", or null when the task has no assigned color. Shown as
    // diagonal stripes over this task's linked entries in the Planner.
    public string? Color { get; set; }

    // Free-form details, shown only on the Tasks page itself - never
    // surfaced on the Planner timeline (unlike the task name).
    public string? Notes { get; set; }

    // Purely informational and for sort ordering - no reminder/overdue
    // logic reads this anywhere.
    public DateOnly? DueDate { get; set; }

    // Not Include()d anywhere the API returns a TaskItem, so this stays an
    // empty list on every response - excluded from JSON rather than left to
    // serialize as misleadingly-always-empty.
    [JsonIgnore]
    public ICollection<ScheduleEntry> Entries { get; set; } = new List<ScheduleEntry>();
}

// Named TaskItem/TaskItemStatus rather than Task/TaskStatus to avoid
// colliding with System.Threading.Tasks.Task, used throughout this codebase
// for every async method.
public enum TaskItemStatus
{
    Open = 0,
    InProgress = 1,
    Done = 2,
}

// A Task carries its own planned time and can be linked to a planner entry
// directly. A Group has no planned time of its own (it's the sum of its
// subtasks') but CAN be linked to a planner entry - the entry's real/tracked
// time accrues on the group as a whole, not on individual subtasks.
public enum TaskItemType
{
    Task = 0,
    Group = 1,
}

public enum TaskItemPriority
{
    None = 0,
    Low = 1,
    Medium = 2,
    High = 3,
}
