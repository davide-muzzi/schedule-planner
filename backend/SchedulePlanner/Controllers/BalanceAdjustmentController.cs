namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class BalanceAdjustmentController : ControllerBase
{
    private readonly BalanceAdjustmentService _service;

    public BalanceAdjustmentController(BalanceAdjustmentService service)
    {
        _service = service;
    }

    // Get the current manual balance adjustment (single value, single-user app)
    [HttpGet]
    public async Task<ActionResult<BalanceAdjustment>> Get()
    {
        var adjustment = await _service.GetAsync();
        return Ok(adjustment);
    }

    // Set the manual balance adjustment to an absolute total
    [HttpPut]
    public async Task<ActionResult<BalanceAdjustment>> Set(BalanceAdjustment body)
    {
        var adjustment = await _service.SetAsync(body.TotalMinutes);
        return Ok(adjustment);
    }
}
