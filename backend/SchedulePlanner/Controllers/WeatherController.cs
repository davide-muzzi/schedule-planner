namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Mvc;
using SchedulePlanner.Dtos;
using SchedulePlanner.Services;

[ApiController]
[Route("api/[controller]")]
public class WeatherController : ControllerBase
{
    // Rotkreuz, CH - fallback when the browser doesn't supply coordinates
    // (geolocation denied/unsupported).
    private const double DefaultLatitude = 47.1419;
    private const double DefaultLongitude = 8.4326;

    private readonly WeatherService _service;

    public WeatherController(WeatherService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<WeatherDto>> Get([FromQuery] double? lat, [FromQuery] double? lon)
    {
        try
        {
            var weather = await _service.GetForecastAsync(lat ?? DefaultLatitude, lon ?? DefaultLongitude);
            return Ok(weather);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or TaskCanceledException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, "Failed to fetch weather data.");
        }
    }
}
