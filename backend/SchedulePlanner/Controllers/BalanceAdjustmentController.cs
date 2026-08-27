namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class BalanceAdjustmentController : ControllerBase
{
    private readonly BalanceAdjustmentService _service;
    private readonly ILogger<BalanceAdjustmentController> _logger;

    public BalanceAdjustmentController(BalanceAdjustmentService service, ILogger<BalanceAdjustmentController> logger)
    {
        _service = service;
        _logger = logger;
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
        _logger.LogInformation("Balance adjustment set to {TotalMinutes} minutes", body.TotalMinutes);
        return Ok(adjustment);
    }
}
