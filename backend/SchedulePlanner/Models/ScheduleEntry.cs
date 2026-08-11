namespace SchedulePlanner.Models;

public class ScheduleEntry
{
    public int Id { get; set; }
    public string? Title { get; set; }
    public DateOnly Date { get; set; }
    public bool AllDay { get; set; } = false;
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public EntryType EntryType { get; set; } = EntryType.Working;
    public WorkLocation?  WorkLocation { get; set; }
    public ColorPreset ColorPreset { get; set; } = ColorPreset.White;
    public string? Notes { get; set; }
}

public enum EntryType
{
    Working,
    Sick,
    Vacation,
    Appointment,
    OvertimeCompensation,
    Other
}

public enum WorkLocation
{
    Office,
    Remote,
}

public enum ColorPreset
{
    Red,
    Orange,
    Yellow,
    Green,
    Blue,
    Grey,
    White
}