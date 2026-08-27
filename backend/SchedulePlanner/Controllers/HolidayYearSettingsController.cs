namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class HolidayYearSettingsController : ControllerBase
{
    private readonly HolidayYearSettingService _service;
    private readonly ILogger<HolidayYearSettingsController> _logger;

    public HolidayYearSettingsController(HolidayYearSettingService service, ILogger<HolidayYearSettingsController> logger)
    {
        _service = service;
        _logger = logger;
    }

    // Get the holiday allotment/adjustment for a given calendar year, creating
    // a default row (25 days, no adjustment) the first time that year is asked for.
    [HttpGet("{year}")]
    public async Task<ActionResult<HolidayYearSetting>> Get(int year)
    {
        var settings = await _service.GetOrCreateAsync(year);
        return Ok(settings);
    }

    [HttpPut("{year}")]
    public async Task<ActionResult<HolidayYearSetting>> Set(int year, HolidayYearSetting body)
    {
        var settings = await _service.SetAsync(year, body.AllotmentDays, body.AdjustmentDays);
        _logger.LogInformation(
            "Holiday settings for {Year} set to {AllotmentDays} allotment / {AdjustmentDays} adjustment",
            year, body.AllotmentDays, body.AdjustmentDays);
        return Ok(settings);
    }
}
