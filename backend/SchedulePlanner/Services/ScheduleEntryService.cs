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

        existing.Title = entry.Title;
        existing.Date = entry.Date;
        existing.AllDay = entry.AllDay;
        existing.StartTime = entry.StartTime;
        existing.EndTime = entry.EndTime;
        existing.EntryType = entry.EntryType;
        existing.WorkLocation = entry.WorkLocation;
        existing.ColorPreset = entry.ColorPreset;
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

    private void ValidateAllDay(ScheduleEntry entry)
    {
        if (entry.AllDay)
        {
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

    private async Task CheckForOverlapAsync(ScheduleEntry entry, int? excludeId = null)
    {
        if (entry.AllDay)
        {
            return; // no time range to overlap-check
        }

        var overlapping = await _context.ScheduleEntries
            .Where(e => e.Id != excludeId
                     && e.Date == entry.Date
                     && !e.AllDay
                     && e.StartTime < entry.EndTime
                     && e.EndTime > entry.StartTime)
            .AnyAsync();

        if (overlapping)
        {
            throw new InvalidOperationException("This entry overlaps with an existing schedule entry.");
        }
    }
}