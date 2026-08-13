namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class WorkGoalSettingsController : ControllerBase
{
    private readonly WorkGoalSettingsService _service;

    public WorkGoalSettingsController(WorkGoalSettingsService service)
    {
        _service = service;
    }

    // Get the current weekly worktime goal (single value, single-user app)
    [HttpGet]
    public async Task<ActionResult<WorkGoalSettings>> Get()
    {
        var settings = await _service.GetAsync();
        return Ok(settings);
    }

    // Set the weekly worktime goal; the daily goal is always weeklyMinutes / 5,
    // computed on the frontend rather than stored separately
    [HttpPut]
    public async Task<ActionResult<WorkGoalSettings>> Set(WorkGoalSettings body)
    {
        var settings = await _service.SetAsync(body.WeeklyTargetMinutes);
        return Ok(settings);
    }
}
