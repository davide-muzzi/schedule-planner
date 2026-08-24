namespace SchedulePlanner.Services;

using System.Net.Http.Json;
using SchedulePlanner.Dtos;

public class WeatherService
{
    private readonly HttpClient _httpClient;

    public WeatherService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<WeatherDto> GetForecastAsync(double latitude, double longitude)
    {
        var url = "v1/forecast" +
            $"?latitude={latitude}&longitude={longitude}" +
            "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
            "&timezone=auto";

        var upstream = await _httpClient.GetFromJsonAsync<OpenMeteoResponse>(url)
            ?? throw new InvalidOperationException("Open-Meteo returned an empty response.");

        var daily = upstream.Daily;
        var forecasts = new List<DailyForecastDto>(daily.Time.Count);
        for (var i = 0; i < daily.Time.Count; i++)
        {
            forecasts.Add(new DailyForecastDto
            {
                Date = DateOnly.Parse(daily.Time[i]),
                WeatherCode = daily.WeatherCode[i],
                TempMax = daily.Temperature2mMax[i],
                TempMin = daily.Temperature2mMin[i],
                PrecipitationProbabilityMax = daily.PrecipitationProbabilityMax[i]
            });
        }

        return new WeatherDto
        {
            UpdatedAt = DateTimeOffset.UtcNow,
            Current = new CurrentWeatherDto
            {
                Temperature = upstream.Current.Temperature2m,
                ApparentTemperature = upstream.Current.ApparentTemperature,
                WeatherCode = upstream.Current.WeatherCode,
                WindSpeed = upstream.Current.WindSpeed10m,
                RelativeHumidity = upstream.Current.RelativeHumidity2m
            },
            TodayHigh = daily.Temperature2mMax[0],
            TodayLow = daily.Temperature2mMin[0],
            Sunrise = daily.Sunrise[0],
            Sunset = daily.Sunset[0],
            Daily = forecasts
        };
    }
}
