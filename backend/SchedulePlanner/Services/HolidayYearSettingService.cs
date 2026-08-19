namespace SchedulePlanner.Services;

using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class HolidayYearSettingService
{
    private readonly ScheduleContext _context;

    public HolidayYearSettingService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<HolidayYearSetting> GetOrCreateAsync(int year)
    {
        var settings = await _context.HolidayYearSettings.FirstOrDefaultAsync(h => h.Year == year);
        if (settings is null)
        {
            settings = new HolidayYearSetting { Year = year };
            _context.HolidayYearSettings.Add(settings);
            await _context.SaveChangesAsync();
        }
        return settings;
    }

    public async Task<HolidayYearSetting> SetAsync(int year, double allotmentDays, double adjustmentDays)
    {
        var settings = await GetOrCreateAsync(year);
        settings.AllotmentDays = allotmentDays;
        settings.AdjustmentDays = adjustmentDays;
        await _context.SaveChangesAsync();
        return settings;
    }
}
