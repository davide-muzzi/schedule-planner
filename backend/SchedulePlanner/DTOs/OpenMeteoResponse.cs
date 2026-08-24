namespace SchedulePlanner.Dtos;

using System.Text.Json.Serialization;

// Shape of Open-Meteo's forecast response - only the fields we ask for.
// Kept separate from WeatherDto because Open-Meteo uses snake_case and
// parallel arrays (one list per field, indexed by day), which isn't a
// shape we want leaking out to our own API's consumers.
public class OpenMeteoResponse
{
    [JsonPropertyName("current")]
    public OpenMeteoCurrent Current { get; set; } = new();

    [JsonPropertyName("daily")]
    public OpenMeteoDaily Daily { get; set; } = new();
}

public class OpenMeteoCurrent
{
    [JsonPropertyName("temperature_2m")]
    public double Temperature2m { get; set; }

    [JsonPropertyName("apparent_temperature")]
    public double ApparentTemperature { get; set; }

    [JsonPropertyName("weather_code")]
    public int WeatherCode { get; set; }

    [JsonPropertyName("wind_speed_10m")]
    public double WindSpeed10m { get; set; }

    [JsonPropertyName("relative_humidity_2m")]
    public double RelativeHumidity2m { get; set; }
}

public class OpenMeteoDaily
{
    [JsonPropertyName("time")]
    public List<string> Time { get; set; } = new();

    [JsonPropertyName("weather_code")]
    public List<int> WeatherCode { get; set; } = new();

    [JsonPropertyName("temperature_2m_max")]
    public List<double> Temperature2mMax { get; set; } = new();

    [JsonPropertyName("temperature_2m_min")]
    public List<double> Temperature2mMin { get; set; } = new();

    [JsonPropertyName("precipitation_probability_max")]
    public List<double> PrecipitationProbabilityMax { get; set; } = new();

    [JsonPropertyName("sunrise")]
    public List<string> Sunrise { get; set; } = new();

    [JsonPropertyName("sunset")]
    public List<string> Sunset { get; set; } = new();
}
