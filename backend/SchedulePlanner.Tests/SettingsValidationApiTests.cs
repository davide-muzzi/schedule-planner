namespace SchedulePlanner.Tests;

using System.Net;
using System.Net.Http.Json;
using SchedulePlanner.Models;

// Confirms the [Range] validation added to the settings models (A06) is
// actually enforced through the real HTTP pipeline via [ApiController]'s
// automatic model validation, not just when calling the service directly.
public class SettingsValidationApiTests : IAsyncLifetime
{
    private readonly TestWebApplicationFactory _factory = new();
    private HttpClient _client = null!;

    public Task InitializeAsync()
    {
        _client = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Put_BalanceAdjustment_OutOfRangeValue_ReturnsBadRequest()
    {
        var response = await _client.PutAsJsonAsync(
            "/api/BalanceAdjustment", new BalanceAdjustment { TotalMinutes = 999_999 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Put_BalanceAdjustment_ValidValue_ReturnsOk()
    {
        var response = await _client.PutAsJsonAsync(
            "/api/BalanceAdjustment", new BalanceAdjustment { TotalMinutes = 120 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Put_WorkGoalSettings_OutOfRangeValue_ReturnsBadRequest()
    {
        var response = await _client.PutAsJsonAsync(
            "/api/WorkGoalSettings", new WorkGoalSettings { WeeklyTargetMinutes = -100 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Put_HolidayYearSettings_OutOfRangeAllotment_ReturnsBadRequest()
    {
        var response = await _client.PutAsJsonAsync(
            "/api/HolidayYearSettings/2026", new HolidayYearSetting { AllotmentDays = 500 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
