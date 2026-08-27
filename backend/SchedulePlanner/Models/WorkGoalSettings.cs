using System.ComponentModel.DataAnnotations;

namespace SchedulePlanner.Models;

public class WorkGoalSettings
{
    public int Id { get; set; }

    [Range(0, 10080)]
    public int WeeklyTargetMinutes { get; set; }
}
