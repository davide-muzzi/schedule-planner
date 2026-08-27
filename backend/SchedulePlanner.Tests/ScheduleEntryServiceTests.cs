namespace SchedulePlanner.Tests;

using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

public class ScheduleEntryServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ScheduleContext _context;
    private readonly ScheduleEntryService _service;

    public ScheduleEntryServiceTests()
    {
        // SQLite ":memory:" databases are tied to a single open connection, so
        // we keep one alive per test and dispose it in Dispose() below - this
        // gives every test a fresh, isolated database.
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ScheduleContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new ScheduleContext(options);
        _context.Database.EnsureCreated();

        _service = new ScheduleEntryService(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private static ScheduleEntry TimedEntry(
        DateOnly date, TimeOnly start, TimeOnly end, EntryType type = EntryType.Working) => new()
    {
        Title = "Test entry",
        Date = date,
        AllDay = false,
        StartTime = start,
        EndTime = end,
        EntryType = type
    };

    private static ScheduleEntry AllDayEntry(DateOnly date, EntryType type) => new()
    {
        Title = "Test entry",
        Date = date,
        AllDay = true,
        EntryType = type
    };

    // --- AllDay is only valid for entry types that represent a whole day off ---

    [Theory]
    [InlineData(EntryType.Vacation)]
    [InlineData(EntryType.PublicHoliday)]
    [InlineData(EntryType.Other)]
    public async Task Create_AllDay_WithWholeDayEntryType_Succeeds(EntryType type)
    {
        var created = await _service.CreateAsync(AllDayEntry(new DateOnly(2026, 1, 1), type));

        Assert.True(created.AllDay);
        Assert.Equal(type, created.EntryType);
    }

    [Theory]
    [InlineData(EntryType.Working)]
    [InlineData(EntryType.Appointment)]
    [InlineData(EntryType.OvertimeCompensation)]
    [InlineData(EntryType.Lunch)]
    public async Task Create_AllDay_WithNonWholeDayEntryType_ThrowsArgumentException(EntryType type)
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateAsync(AllDayEntry(new DateOnly(2026, 1, 1), type)));
    }

    [Fact]
    public async Task Create_AllDay_ClearsAnyProvidedStartAndEndTime()
    {
        var entry = AllDayEntry(new DateOnly(2026, 1, 1), EntryType.Vacation);
        entry.StartTime = new TimeOnly(9, 0);
        entry.EndTime = new TimeOnly(17, 0);

        var created = await _service.CreateAsync(entry);

        Assert.Null(created.StartTime);
        Assert.Null(created.EndTime);
    }

    // --- Timed (non-AllDay) entries need a valid, positive-length time range ---

    [Fact]
    public async Task Create_NotAllDay_WithoutStartTime_ThrowsArgumentException()
    {
        var entry = TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0));
        entry.StartTime = null;

        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(entry));
    }

    [Fact]
    public async Task Create_NotAllDay_WithoutEndTime_ThrowsArgumentException()
    {
        var entry = TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0));
        entry.EndTime = null;

        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(entry));
    }

    [Fact]
    public async Task Create_NotAllDay_EndTimeEqualsStartTime_ThrowsArgumentException()
    {
        var entry = TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(9, 0));

        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(entry));
    }

    [Fact]
    public async Task Create_NotAllDay_EndTimeBeforeStartTime_ThrowsArgumentException()
    {
        var entry = TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(17, 0), new TimeOnly(9, 0));

        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(entry));
    }

    [Fact]
    public async Task Create_NotAllDay_WithValidTimeRange_Succeeds()
    {
        var created = await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0)));

        Assert.Equal(new TimeOnly(9, 0), created.StartTime);
        Assert.Equal(new TimeOnly(17, 0), created.EndTime);
    }

    // --- Two timed entries on the same day must not overlap in time ---

    [Fact]
    public async Task Create_OverlappingTimeRangeOnSameDate_ThrowsInvalidOperationException()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateAsync(TimedEntry(date, new TimeOnly(11, 0), new TimeOnly(13, 0))));
    }

    [Fact]
    public async Task Create_BackToBackTimeRangeOnSameDate_Succeeds()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));

        // Touching boundaries (one ends exactly when the other starts) is not
        // an overlap - back-to-back entries on the same day are allowed.
        var second = await _service.CreateAsync(TimedEntry(date, new TimeOnly(12, 0), new TimeOnly(15, 0)));

        Assert.Equal(new TimeOnly(12, 0), second.StartTime);
    }

    [Fact]
    public async Task Create_NonOverlappingTimeRangeOnSameDate_Succeeds()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var second = await _service.CreateAsync(TimedEntry(date, new TimeOnly(13, 0), new TimeOnly(15, 0)));

        Assert.NotEqual(0, second.Id);
    }

    [Fact]
    public async Task Create_SameTimeRangeOnDifferentDate_Succeeds()
    {
        await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var second = await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 2), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        Assert.NotEqual(0, second.Id);
    }

    // --- An AllDay entry occupies the whole day: nothing else may share that date ---

    [Fact]
    public async Task Create_AllDay_WhenTimedEntryExistsOnSameDate_ThrowsInvalidOperationException()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateAsync(AllDayEntry(date, EntryType.Vacation)));
    }

    [Fact]
    public async Task Create_TimedEntry_WhenAllDayEntryExistsOnSameDate_ThrowsInvalidOperationException()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(AllDayEntry(date, EntryType.Vacation));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0))));
    }

    [Fact]
    public async Task Create_TwoAllDayEntries_OnSameDate_ThrowsInvalidOperationException()
    {
        var date = new DateOnly(2026, 1, 1);
        await _service.CreateAsync(AllDayEntry(date, EntryType.Vacation));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateAsync(AllDayEntry(date, EntryType.PublicHoliday)));
    }

    [Fact]
    public async Task Create_AllDayEntries_OnDifferentDates_Succeeds()
    {
        await _service.CreateAsync(AllDayEntry(new DateOnly(2026, 1, 1), EntryType.Vacation));

        var second = await _service.CreateAsync(AllDayEntry(new DateOnly(2026, 1, 2), EntryType.Vacation));

        Assert.NotEqual(0, second.Id);
    }

    // --- Updating an entry must not conflict with itself, but must still be
    //     validated against other entries ---

    [Fact]
    public async Task Update_EntryWithUnchangedTimes_DoesNotConflictWithItself()
    {
        var date = new DateOnly(2026, 1, 1);
        var created = await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var updated = await _service.UpdateAsync(
            created.Id, TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0), EntryType.Appointment));

        Assert.NotNull(updated);
        Assert.Equal(EntryType.Appointment, updated!.EntryType);
    }

    [Fact]
    public async Task Update_TimesToOverlapWithAnotherEntry_ThrowsInvalidOperationException()
    {
        var date = new DateOnly(2026, 1, 1);
        var first = await _service.CreateAsync(TimedEntry(date, new TimeOnly(9, 0), new TimeOnly(12, 0)));
        var second = await _service.CreateAsync(TimedEntry(date, new TimeOnly(13, 0), new TimeOnly(15, 0)));

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.UpdateAsync(
            second.Id, TimedEntry(date, new TimeOnly(11, 0), new TimeOnly(14, 0))));

        Assert.NotEqual(0, first.Id); // first entry untouched by the failed update
    }

    [Fact]
    public async Task Update_NonexistentId_ReturnsNull()
    {
        var updated = await _service.UpdateAsync(
            999, TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        Assert.Null(updated);
    }

    // --- Delete / bulk delete ---

    [Fact]
    public async Task Delete_ExistingEntry_RemovesItAndReturnsTrue()
    {
        var created = await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var deleted = await _service.DeleteAsync(created.Id);

        Assert.True(deleted);
        Assert.Null(await _service.GetByIdAsync(created.Id));
    }

    [Fact]
    public async Task Delete_NonexistentEntry_ReturnsFalse()
    {
        Assert.False(await _service.DeleteAsync(999));
    }

    [Fact]
    public async Task DeleteBulk_WithCutoff_OnlyRemovesEntriesStrictlyBeforeIt()
    {
        await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(12, 0)));
        var onCutoff = await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 5), new TimeOnly(9, 0), new TimeOnly(12, 0)));
        var afterCutoff = await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 10), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var deletedCount = await _service.DeleteBulkAsync(new DateOnly(2026, 1, 5));

        Assert.Equal(1, deletedCount);
        Assert.NotNull(await _service.GetByIdAsync(onCutoff.Id));
        Assert.NotNull(await _service.GetByIdAsync(afterCutoff.Id));
    }

    [Fact]
    public async Task DeleteBulk_WithNullCutoff_RemovesEverything()
    {
        await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(12, 0)));
        await _service.CreateAsync(
            TimedEntry(new DateOnly(2026, 1, 2), new TimeOnly(9, 0), new TimeOnly(12, 0)));

        var deletedCount = await _service.DeleteBulkAsync(null);

        Assert.Equal(2, deletedCount);
        Assert.Empty(await _service.GetAllAsync());
    }
}
