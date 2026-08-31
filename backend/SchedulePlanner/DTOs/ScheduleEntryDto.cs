namespace SchedulePlanner.Dtos;

using SchedulePlanner.Models;

public class ScheduleEntryDto
{
    public string? Title { get; set; }
    public DateOnly Date { get; set; }
    public bool AllDay { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public EntryType EntryType { get; set; } = EntryType.Working;
    public WorkLocation? WorkLocation { get; set; }
    public int? TaskItemId { get; set; }
    public string? Notes { get; set; }
}