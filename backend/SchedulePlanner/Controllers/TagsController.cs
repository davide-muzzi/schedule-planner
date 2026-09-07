namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Dtos;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class TagsController : ControllerBase
{
    private readonly ITagService _service;
    private readonly ILogger<TagsController> _logger;

    public TagsController(ITagService service, ILogger<TagsController> logger)
    {
        _service = service;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<Tag>>> GetAll()
    {
        var tags = await _service.GetAllAsync();
        return Ok(tags);
    }

    [HttpPost]
    public async Task<ActionResult<Tag>> Create(TagDto dto)
    {
        var tag = new Tag { Name = dto.Name, Color = dto.Color };

        try
        {
            var created = await _service.CreateAsync(tag);
            _logger.LogInformation("Created tag {Id}", created.Id);
            return CreatedAtAction(nameof(GetAll), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Rejected tag creation");
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Tag>> Update(int id, TagDto dto)
    {
        var tag = new Tag { Name = dto.Name, Color = dto.Color };

        try
        {
            var updated = await _service.UpdateAsync(id, tag);
            if (updated is null)
            {
                return NotFound();
            }
            _logger.LogInformation("Updated tag {Id}", id);
            return Ok(updated);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Rejected tag update for {Id}", id);
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
        _logger.LogInformation("Deleted tag {Id}", id);
        return NoContent();
    }
}
