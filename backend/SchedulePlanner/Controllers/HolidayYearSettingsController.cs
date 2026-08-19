namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class HolidayYearSettingsController : ControllerBase
{
    private readonly HolidayYearSettingService _service;

    public HolidayYearSettingsController(HolidayYearSettingService service)
    {
        _service = service;
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
        return Ok(settings);
    }
}
