using Microsoft.EntityFrameworkCore;

namespace SchedulePlanner.Models;

public class ShiftContext : DbContext
{
    public ShiftContext(DbContextOptions<ShiftContext> options)
        : base(options)
    {
    }

    public DbSet<ShiftEntry> ShiftEntries { get; set; } = null!;
}