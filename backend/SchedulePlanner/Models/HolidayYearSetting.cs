using System.ComponentModel.DataAnnotations;

namespace SchedulePlanner.Models;

public class HolidayYearSetting
{
    public int Id { get; set; }
    public int Year { get; set; }

    [Range(0, 366)]
    public double AllotmentDays { get; set; } = 25;

    [Range(-366, 366)]
    public double AdjustmentDays { get; set; } = 0;
}
