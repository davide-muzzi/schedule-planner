namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
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

    [HttpGet]
    public async Task<ActionResult<List<ScheduleEntry>>> GetAll()
    {
        var entries = await _service.GetAllAsync();
        return Ok(entries);
    }

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

    [HttpPost]
    public async Task<ActionResult<ScheduleEntry>> Create(ScheduleEntry entry)
    {
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

    [HttpPut("{id}")]
    public async Task<ActionResult<ScheduleEntry>> Update(int id, ScheduleEntry entry)
    {
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
}