namespace SchedulePlanner.Dtos;

using SchedulePlanner.Models;

public class TaskItemDto
{
    public string Name { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Backlog;
    public TaskItemPriority Priority { get; set; } = TaskItemPriority.None;
    public TaskItemType TaskType { get; set; } = TaskItemType.Task;
    public int? ParentTaskId { get; set; }
    public string? Color { get; set; }
    public string? Notes { get; set; }
    public DateOnly? DueDate { get; set; }
}
