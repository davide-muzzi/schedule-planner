using System.Text.Json.Serialization;

namespace SchedulePlanner.Models;

public class TaskItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Open;

    // "#rrggbb", or null when the task has no assigned color. Shown as
    // diagonal stripes over this task's linked entries in the Planner.
    public string? Color { get; set; }

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
