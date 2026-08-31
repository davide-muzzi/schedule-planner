namespace SchedulePlanner.Services;

using SchedulePlanner.Models;

public interface ITaskItemService
{
    Task<List<TaskItem>> GetAllAsync();
    Task<TaskItem?> GetByIdAsync(int id);
    Task<TaskItem> CreateAsync(TaskItem task);
    Task<TaskItem?> UpdateAsync(int id, TaskItem task);
    Task<bool> DeleteAsync(int id);
    Task<int> DeleteAllAsync();
}
