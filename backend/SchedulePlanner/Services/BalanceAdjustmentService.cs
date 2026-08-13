namespace SchedulePlanner.Services;

using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class BalanceAdjustmentService
{
    private readonly ScheduleContext _context;

    public BalanceAdjustmentService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<BalanceAdjustment> GetAsync()
    {
        var adjustment = await _context.BalanceAdjustments.FirstOrDefaultAsync();
        if (adjustment is null)
        {
            adjustment = new BalanceAdjustment { TotalMinutes = 0 };
            _context.BalanceAdjustments.Add(adjustment);
            await _context.SaveChangesAsync();
        }
        return adjustment;
    }

    public async Task<BalanceAdjustment> SetAsync(int totalMinutes)
    {
        var adjustment = await GetAsync();
        adjustment.TotalMinutes = totalMinutes;
        await _context.SaveChangesAsync();
        return adjustment;
    }
}
