namespace SchedulePlanner.Services;

using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class WorkGoalSettingsService
{
    private const int DefaultWeeklyTargetMinutes = 42 * 60;

    private readonly ScheduleContext _context;

    public WorkGoalSettingsService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<WorkGoalSettings> GetAsync()
    {
        var settings = await _context.WorkGoalSettings.FirstOrDefaultAsync();
        if (settings is null)
        {
            settings = new WorkGoalSettings { WeeklyTargetMinutes = DefaultWeeklyTargetMinutes };
            _context.WorkGoalSettings.Add(settings);
            await _context.SaveChangesAsync();
        }
        return settings;
    }

    public async Task<WorkGoalSettings> SetAsync(int weeklyTargetMinutes)
    {
        var settings = await GetAsync();
        settings.WeeklyTargetMinutes = weeklyTargetMinutes;
        await _context.SaveChangesAsync();
        return settings;
    }
}
