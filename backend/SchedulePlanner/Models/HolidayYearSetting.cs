namespace SchedulePlanner.Models;

public class HolidayYearSetting
{
    public int Id { get; set; }
    public int Year { get; set; }
    public double AllotmentDays { get; set; } = 25;
    public double AdjustmentDays { get; set; } = 0;
}
