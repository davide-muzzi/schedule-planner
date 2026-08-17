namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Dtos;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class ScheduleEntriesController : ControllerBase
{
    private readonly IScheduleEntryService _service;

    public ScheduleEntriesController(IScheduleEntryService service)
    {
        _service = service;
    }
    
    // Get all entries
    [HttpGet]
    public async Task<ActionResult<List<ScheduleEntry>>> GetAll()
    {
        var entries = await _service.GetAllAsync();
        return Ok(entries);
    }

    // Get entry by ID
    [HttpGet("{id}")]
    public async Task<ActionResult<ScheduleEntry>> GetById(int id)
    {
        var entry = await _service.GetByIdAsync(id);
        if (entry is null)
        {
            return NotFound();
        }
        return Ok(entry);
    }

    // Create new entry
    [HttpPost]
    public async Task<ActionResult<ScheduleEntry>> Create(ScheduleEntryDto dto)
    {
        var entry = new ScheduleEntry
        {
            Title = dto.Title,
            Date = dto.Date,
            AllDay = dto.AllDay,
            StartTime = dto.StartTime,
            EndTime = dto.EndTime,
            EntryType = dto.EntryType,
            WorkLocation = dto.WorkLocation,
            ColorPreset = dto.ColorPreset,
            Notes = dto.Notes
        };

        try
        {
            var created = await _service.CreateAsync(entry);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(ex.Message);
        }
    }

    // Update entry by ID
    [HttpPut("{id}")]
    public async Task<ActionResult<ScheduleEntry>> Update(int id, ScheduleEntryDto dto)
    {
        var entry = new ScheduleEntry
        {
            Title = dto.Title,
            Date = dto.Date,
            AllDay = dto.AllDay,
            StartTime = dto.StartTime,
            EndTime = dto.EndTime,
            EntryType = dto.EntryType,
            WorkLocation = dto.WorkLocation,
            ColorPreset = dto.ColorPreset,
            Notes = dto.Notes
        };

        try
        {
            var updated = await _service.UpdateAsync(id, entry);
            if (updated is null)
            {
                return NotFound();
            }
            return Ok(updated);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(ex.Message);
        }
    }

    // Delete entry by ID
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _service.DeleteAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }

    // Bulk delete - omit olderThanDays to delete everything, or pass it to
    // only delete entries dated before (today - olderThanDays)
    [HttpDelete]
    public async Task<ActionResult<object>> DeleteBulk([FromQuery] int? olderThanDays)
    {
        DateOnly? cutoff = olderThanDays is null
            ? null
            : DateOnly.FromDateTime(DateTime.Today).AddDays(-olderThanDays.Value);

        var deletedCount = await _service.DeleteBulkAsync(cutoff);
        return Ok(new { deletedCount });
    }
}