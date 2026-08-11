namespace SchedulePlanner.Services;

using SchedulePlanner.Models;

public interface IScheduleEntryService
{
    Task<List<ScheduleEntry>> GetAllAsync();
    Task<ScheduleEntry?> GetByIdAsync(int id);
    Task<ScheduleEntry> CreateAsync(ScheduleEntry entry);
    Task<ScheduleEntry?> UpdateAsync(int id, ScheduleEntry entry);
    Task<bool> DeleteAsync(int id);
}