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
    public DbSet<HolidayYearSetting> HolidayYearSettings { get; set; } = null!;
    public DbSet<TaskItem> Tasks { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Optional link: deleting a task unlinks its entries rather than
        // taking them down with it.
        modelBuilder.Entity<ScheduleEntry>()
            .HasOne(e => e.TaskItem)
            .WithMany(t => t.Entries)
            .HasForeignKey(e => e.TaskItemId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}