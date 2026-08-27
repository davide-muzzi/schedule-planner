namespace SchedulePlanner.Tests;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using SchedulePlanner.Dtos;
using SchedulePlanner.Models;

// Exercises ScheduleEntriesController through the real HTTP pipeline - real
// routing, real model binding/JSON (de)serialization, real service and
// database - things ScheduleEntryServiceTests can't verify on their own.
public class ScheduleEntriesApiTests : IAsyncLifetime
{
    // Mirrors the JsonStringEnumConverter registered in Program.cs, so the
    // test client (de)serializes enums the same way the real app does.
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly TestWebApplicationFactory _factory = new();
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        _client = _factory.CreateClient();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static ScheduleEntryDto TimedDto(DateOnly date, TimeOnly start, TimeOnly end) => new()
    {
        Title = "Test entry",
        Date = date,
        AllDay = false,
        StartTime = start,
        EndTime = end,
        EntryType = EntryType.Working
    };

    [Fact]
    public async Task Post_ValidEntry_ReturnsCreatedWithLocationHeader()
    {
        var dto = TimedDto(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0));

        var response = await _client.PostAsJsonAsync("/api/ScheduleEntries", dto, JsonOptions);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        var created = await response.Content.ReadFromJsonAsync<ScheduleEntry>(JsonOptions);
        Assert.NotNull(created);
        Assert.Equal("Test entry", created!.Title);
        Assert.True(created.Id > 0);
    }

    [Fact]
    public async Task Post_OverlappingEntry_ReturnsBadRequestWithMessage()
    {
        var date = new DateOnly(2026, 1, 1);
        await _client.PostAsJsonAsync(
            "/api/ScheduleEntries", TimedDto(date, new TimeOnly(9, 0), new TimeOnly(12, 0)), JsonOptions);

        var response = await _client.PostAsJsonAsync(
            "/api/ScheduleEntries", TimedDto(date, new TimeOnly(11, 0), new TimeOnly(13, 0)), JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("overlaps", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Post_AllDayWithDisallowedEntryType_ReturnsBadRequest()
    {
        var dto = new ScheduleEntryDto
        {
            Title = "Bad all-day",
            Date = new DateOnly(2026, 1, 1),
            AllDay = true,
            EntryType = EntryType.Working
        };

        var response = await _client.PostAsJsonAsync("/api/ScheduleEntries", dto, JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetById_ExistingEntry_ReturnsOkWithMatchingData()
    {
        var created = await CreateEntryAsync(TimedDto(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0)));

        var response = await _client.GetAsync($"/api/ScheduleEntries/{created.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var fetched = await response.Content.ReadFromJsonAsync<ScheduleEntry>(JsonOptions);
        Assert.Equal(created.Id, fetched!.Id);
    }

    [Fact]
    public async Task GetById_NonexistentEntry_ReturnsNotFound()
    {
        var response = await _client.GetAsync("/api/ScheduleEntries/999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Put_ExistingEntry_ReturnsOkWithUpdatedData()
    {
        var created = await CreateEntryAsync(TimedDto(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0)));
        var update = TimedDto(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0));
        update.Title = "Updated title";

        var response = await _client.PutAsJsonAsync($"/api/ScheduleEntries/{created.Id}", update, JsonOptions);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<ScheduleEntry>(JsonOptions);
        Assert.Equal("Updated title", updated!.Title);
    }

    [Fact]
    public async Task Delete_ExistingEntry_ReturnsNoContent_AndSubsequentGetReturnsNotFound()
    {
        var created = await CreateEntryAsync(TimedDto(new DateOnly(2026, 1, 1), new TimeOnly(9, 0), new TimeOnly(17, 0)));

        var deleteResponse = await _client.DeleteAsync($"/api/ScheduleEntries/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getResponse = await _client.GetAsync($"/api/ScheduleEntries/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);
    }

    private async Task<ScheduleEntry> CreateEntryAsync(ScheduleEntryDto dto)
    {
        var response = await _client.PostAsJsonAsync("/api/ScheduleEntries", dto, JsonOptions);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ScheduleEntry>(JsonOptions))!;
    }
}
