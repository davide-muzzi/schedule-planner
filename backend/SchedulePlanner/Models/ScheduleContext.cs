using Microsoft.EntityFrameworkCore;

namespace SchedulePlanner.Models;

public class ScheduleContext : DbContext
{
    public ScheduleContext(DbContextOptions<ScheduleContext> options)
        : base(options)
    {
    }

    public DbSet<ScheduleEntry> ScheduleEntries { get; set; } = null!;
    public DbSet<BalanceAdjustment> BalanceAdjustments { get; set; } = null!;
    public DbSet<WorkGoalSettings> WorkGoalSettings { get; set; } = null!;
}