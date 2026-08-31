namespace SchedulePlanner.Services;

using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class ScheduleEntryService : IScheduleEntryService
{
    private readonly ScheduleContext _context;

    public ScheduleEntryService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<List<ScheduleEntry>> GetAllAsync()
    {
        return await _context.ScheduleEntries.ToListAsync();
    }

    public async Task<ScheduleEntry?> GetByIdAsync(int id)
    {
        return await _context.ScheduleEntries.FindAsync(id);
    }

    public async Task<ScheduleEntry> CreateAsync(ScheduleEntry entry)
    {
        ValidateAllDay(entry);
        await CheckForOverlapAsync(entry);
        await ValidateTaskLinkAsync(entry);

        _context.ScheduleEntries.Add(entry);
        await _context.SaveChangesAsync();
        return entry;
    }

    public async Task<ScheduleEntry?> UpdateAsync(int id, ScheduleEntry entry)
    {
        var existing = await _context.ScheduleEntries.FindAsync(id);
        if (existing is null)
        {
            return null;
        }

        ValidateAllDay(entry);
        await CheckForOverlapAsync(entry, excludeId: id);
        await ValidateTaskLinkAsync(entry);

        existing.Title = entry.Title;
        existing.Date = entry.Date;
        existing.AllDay = entry.AllDay;
        existing.StartTime = entry.StartTime;
        existing.EndTime = entry.EndTime;
        existing.EntryType = entry.EntryType;
        existing.WorkLocation = entry.WorkLocation;
        existing.TaskItemId = entry.TaskItemId;
        existing.Notes = entry.Notes;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var existing = await _context.ScheduleEntries.FindAsync(id);
        if (existing is null)
        {
            return false;
        }

        _context.ScheduleEntries.Remove(existing);
        await _context.SaveChangesAsync();
        return true;
    }

    // olderThan == null means "delete everything"
    public async Task<int> DeleteBulkAsync(DateOnly? olderThan)
    {
        var query = _context.ScheduleEntries.AsQueryable();
        if (olderThan is not null)
        {
            query = query.Where(e => e.Date < olderThan.Value);
        }

        var matching = await query.ToListAsync();
        _context.ScheduleEntries.RemoveRange(matching);
        await _context.SaveChangesAsync();
        return matching.Count;
    }

    // Only entry types that genuinely make sense as a whole day (a vacation
    // day, a public holiday, or a free-form "other" day off) may be AllDay -
    // kept in sync with ALL_DAY_ALLOWED_TYPES in EntryFormModal.vue.
    private static readonly HashSet<EntryType> AllDayAllowedTypes = new()
    {
        EntryType.Vacation,
        EntryType.PublicHoliday,
        EntryType.Other,
    };

    private void ValidateAllDay(ScheduleEntry entry)
    {
        if (entry.AllDay)
        {
            if (!AllDayAllowedTypes.Contains(entry.EntryType))
            {
                throw new ArgumentException($"{entry.EntryType} entries cannot be set to All Day.");
            }

            entry.StartTime = null;
            entry.EndTime = null;
        }
        else if (entry.StartTime is null || entry.EndTime is null)
        {
            throw new ArgumentException("StartTime and EndTime are required unless AllDay is set.");
        }
        else if (entry.EndTime <= entry.StartTime)
        {
            throw new ArgumentException("EndTime must be after StartTime.");
        }
    }

    // A task can only be linked to a Working entry - kept in sync with the
    // disabled-unless-Working Linked Task field in EntryFormModal.vue.
    private async Task ValidateTaskLinkAsync(ScheduleEntry entry)
    {
        if (entry.TaskItemId is null)
        {
            return;
        }

        if (entry.EntryType != EntryType.Working)
        {
            throw new ArgumentException("Only Working entries can be linked to a task.");
        }

        var taskExists = await _context.Tasks.AnyAsync(t => t.Id == entry.TaskItemId);
        if (!taskExists)
        {
            throw new ArgumentException($"Task {entry.TaskItemId} does not exist.");
        }
    }

    // An All Day entry occupies the entire day, so it can neither be added
    // alongside any other entry on that date, nor can any other entry be
    // added on a date that already has one.
    private async Task CheckForOverlapAsync(ScheduleEntry entry, int? excludeId = null)
    {
        if (entry.AllDay)
        {
            var anyOtherEntryOnDate = await _context.ScheduleEntries
                .Where(e => e.Id != excludeId && e.Date == entry.Date)
                .AnyAsync();

            if (anyOtherEntryOnDate)
            {
                throw new InvalidOperationException("An All Day entry cannot share a day with other entries.");
            }

            return;
        }

        var overlapping = await _context.ScheduleEntries
            .Where(e => e.Id != excludeId
                     && e.Date == entry.Date
                     && (e.AllDay || (e.StartTime < entry.EndTime && e.EndTime > entry.StartTime)))
            .AnyAsync();

        if (overlapping)
        {
            throw new InvalidOperationException("This entry overlaps with an existing schedule entry.");
        }
    }
}