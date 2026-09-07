namespace SchedulePlanner.Services;

using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class TaskItemService : ITaskItemService
{
    private readonly ScheduleContext _context;

    public TaskItemService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<List<TaskItem>> GetAllAsync()
    {
        return await _context.Tasks.ToListAsync();
    }

    public async Task<TaskItem?> GetByIdAsync(int id)
    {
        return await _context.Tasks.FindAsync(id);
    }

    public async Task<TaskItem> CreateAsync(TaskItem task)
    {
        await Validate(task, id: null);

        _context.Tasks.Add(task);
        await _context.SaveChangesAsync();
        return task;
    }

    public async Task<TaskItem?> UpdateAsync(int id, TaskItem task)
    {
        var existing = await _context.Tasks.FindAsync(id);
        if (existing is null)
        {
            return null;
        }

        await Validate(task, id);

        existing.Name = task.Name;
        existing.EstimatedMinutes = task.EstimatedMinutes;
        existing.Status = task.Status;
        existing.Priority = task.Priority;
        existing.TaskType = task.TaskType;
        existing.ParentTaskId = task.ParentTaskId;
        existing.Color = task.Color;
        existing.Notes = task.Notes;
        existing.DueDate = task.DueDate;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id, bool cascadeSubtasks = false)
    {
        var existing = await _context.Tasks.FindAsync(id);
        if (existing is null)
        {
            return false;
        }

        if (cascadeSubtasks)
        {
            var subtasks = await _context.Tasks.Where(t => t.ParentTaskId == id).ToListAsync();
            _context.Tasks.RemoveRange(subtasks);
        }

        _context.Tasks.Remove(existing);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<int> DeleteAllAsync()
    {
        var all = await _context.Tasks.ToListAsync();
        _context.Tasks.RemoveRange(all);
        await _context.SaveChangesAsync();
        return all.Count;
    }

    private static readonly Regex HexColorPattern = new("^#[0-9A-Fa-f]{6}$");

    private async Task Validate(TaskItem task, int? id)
    {
        if (string.IsNullOrWhiteSpace(task.Name))
        {
            throw new ArgumentException("Task name is required.");
        }
        // A Group's planned time is derived from its subtasks, not set directly.
        if (task.TaskType == TaskItemType.Task && task.EstimatedMinutes <= 0)
        {
            throw new ArgumentException("Estimated time must be greater than 0.");
        }
        if (task.Color is not null && !HexColorPattern.IsMatch(task.Color))
        {
            throw new ArgumentException("Color must be a hex value like #3b82f6.");
        }
        if (task.ParentTaskId is not null)
        {
            if (task.TaskType == TaskItemType.Group)
            {
                throw new ArgumentException("A Group cannot itself be a subtask.");
            }
            if (task.ParentTaskId == id)
            {
                throw new ArgumentException("A task cannot be its own parent.");
            }
            var parent = await _context.Tasks.FindAsync(task.ParentTaskId);
            if (parent is null)
            {
                throw new ArgumentException("Parent task not found.");
            }
            if (parent.TaskType != TaskItemType.Group)
            {
                throw new ArgumentException("A subtask's parent must be a Group.");
            }
        }
    }
}
