namespace SchedulePlanner.Services;

using SchedulePlanner.Models;

public interface ITaskItemService
{
    Task<List<TaskItem>> GetAllAsync();
    Task<TaskItem?> GetByIdAsync(int id);
    Task<TaskItem> CreateAsync(TaskItem task, List<int>? tagIds = null);
    Task<TaskItem?> UpdateAsync(int id, TaskItem task, List<int>? tagIds = null);
    Task<TaskItem?> SetPinnedAsync(int id, bool pinned);
    Task<bool> DeleteAsync(int id, bool cascadeSubtasks = false);
    Task<int> DeleteAllAsync();
}
