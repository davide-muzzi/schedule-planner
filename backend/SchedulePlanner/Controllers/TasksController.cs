namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Dtos;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly ITaskItemService _service;
    private readonly ILogger<TasksController> _logger;

    public TasksController(ITaskItemService service, ILogger<TasksController> logger)
    {
        _service = service;
        _logger = logger;
    }

    // Get all tasks
    [HttpGet]
    public async Task<ActionResult<List<TaskItem>>> GetAll()
    {
        var tasks = await _service.GetAllAsync();
        return Ok(tasks);
    }

    // Get task by ID
    [HttpGet("{id}")]
    public async Task<ActionResult<TaskItem>> GetById(int id)
    {
        var task = await _service.GetByIdAsync(id);
        if (task is null)
        {
            return NotFound();
        }
        return Ok(task);
    }

    // Create new task
    [HttpPost]
    public async Task<ActionResult<TaskItem>> Create(TaskItemDto dto)
    {
        var task = new TaskItem
        {
            Name = dto.Name,
            EstimatedMinutes = dto.EstimatedMinutes,
            Status = dto.Status,
            Color = dto.Color,
            Notes = dto.Notes,
            DueDate = dto.DueDate,
        };

        try
        {
            var created = await _service.CreateAsync(task);
            _logger.LogInformation("Created task {Id}", created.Id);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Rejected task creation");
            return BadRequest(ex.Message);
        }
    }

    // Update task by ID
    [HttpPut("{id}")]
    public async Task<ActionResult<TaskItem>> Update(int id, TaskItemDto dto)
    {
        var task = new TaskItem
        {
            Name = dto.Name,
            EstimatedMinutes = dto.EstimatedMinutes,
            Status = dto.Status,
            Color = dto.Color,
            Notes = dto.Notes,
            DueDate = dto.DueDate,
        };

        try
        {
            var updated = await _service.UpdateAsync(id, task);
            if (updated is null)
            {
                return NotFound();
            }
            _logger.LogInformation("Updated task {Id}", id);
            return Ok(updated);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Rejected task update for {Id}", id);
            return BadRequest(ex.Message);
        }
    }

    // Delete task by ID
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _service.DeleteAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        _logger.LogInformation("Deleted task {Id}", id);
        return NoContent();
    }

    // Delete every task - used by "Clear all data" and backup-import in the
    // frontend, so wiping/restoring tasks doesn't need one request per task.
    [HttpDelete]
    public async Task<ActionResult<object>> DeleteAll()
    {
        var deletedCount = await _service.DeleteAllAsync();
        _logger.LogInformation("Deleted all {Count} tasks", deletedCount);
        return Ok(new { deletedCount });
    }
}
