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
        Validate(task);

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

        Validate(task);

        existing.Name = task.Name;
        existing.EstimatedMinutes = task.EstimatedMinutes;
        existing.Status = task.Status;
        existing.Color = task.Color;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var existing = await _context.Tasks.FindAsync(id);
        if (existing is null)
        {
            return false;
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

    private static void Validate(TaskItem task)
    {
        if (string.IsNullOrWhiteSpace(task.Name))
        {
            throw new ArgumentException("Task name is required.");
        }
        if (task.EstimatedMinutes <= 0)
        {
            throw new ArgumentException("Estimated time must be greater than 0.");
        }
        if (task.Color is not null && !HexColorPattern.IsMatch(task.Color))
        {
            throw new ArgumentException("Color must be a hex value like #3b82f6.");
        }
    }
}
