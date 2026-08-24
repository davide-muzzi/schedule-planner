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
    public string? Notes { get; set; }
}

public enum EntryType
{
    Working = 0,
    // 1 = Sick, removed - deliberately left unassigned so existing stored
    // values for the members below never shift.
    Vacation = 2,
    Appointment = 3,
    OvertimeCompensation = 4,
    Other = 5,
    PublicHoliday = 6,
    Lunch = 7,
}

public enum WorkLocation
{
    Office,
    Remote,
}