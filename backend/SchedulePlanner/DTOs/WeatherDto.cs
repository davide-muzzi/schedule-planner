namespace SchedulePlanner.Dtos;

// What our own API hands back to the frontend - already flattened out of
// Open-Meteo's parallel-array shape. WeatherCode is passed through as-is;
// mapping it to an icon/description is a presentation concern the frontend
// owns (see weather-page.md §5 - one shared lookup table for hero + cells).
public class WeatherDto
{
    public DateTimeOffset UpdatedAt { get; set; }
    public CurrentWeatherDto Current { get; set; } = new();
    public double TodayHigh { get; set; }
    public double TodayLow { get; set; }
    public string Sunrise { get; set; } = "";
    public string Sunset { get; set; } = "";
    public List<DailyForecastDto> Daily { get; set; } = new();
}

public class CurrentWeatherDto
{
    public double Temperature { get; set; }
    public double ApparentTemperature { get; set; }
    public int WeatherCode { get; set; }
    public double WindSpeed { get; set; }
    public double RelativeHumidity { get; set; }
}

public class DailyForecastDto
{
    public DateOnly Date { get; set; }
    public int WeatherCode { get; set; }
    public double TempMax { get; set; }
    public double TempMin { get; set; }
    public double PrecipitationProbabilityMax { get; set; }
}
