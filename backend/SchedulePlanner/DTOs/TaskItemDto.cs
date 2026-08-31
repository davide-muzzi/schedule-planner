namespace SchedulePlanner.Dtos;

using SchedulePlanner.Models;

public class TaskItemDto
{
    public string Name { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Open;
    public string? Color { get; set; }
    public string? Notes { get; set; }
    public DateOnly? DueDate { get; set; }
}
