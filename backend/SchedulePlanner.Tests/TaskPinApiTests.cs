namespace SchedulePlanner.Tests;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

// Pinning goes through its own endpoint, survives regular updates (which
// don't carry it), and is refused/cleared for subtasks.
public class TaskPinApiTests : IAsyncLifetime
{
    private readonly TestWebApplicationFactory _factory = new();
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _client = await _factory.CreateAuthenticatedClientAsync();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Pin_SurvivesUpdate_AndUnpinClears()
    {
        var id = await CreateTask(new { name = "Pin me", estimatedMinutes = 30 });

        var pinned = await ReadJson(await _client.PutAsJsonAsync($"/api/Tasks/{id}/pin", new { pinned = true }));
        Assert.Equal(JsonValueKind.String, pinned.GetProperty("pinnedAt").ValueKind);

        var updated = await _client.PutAsJsonAsync(
            $"/api/Tasks/{id}", new { name = "Renamed", estimatedMinutes = 30, status = "InProgress" });
        updated.EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.String, (await ReadJson(updated)).GetProperty("pinnedAt").ValueKind);

        var unpinned = await ReadJson(await _client.PutAsJsonAsync($"/api/Tasks/{id}/pin", new { pinned = false }));
        Assert.Equal(JsonValueKind.Null, unpinned.GetProperty("pinnedAt").ValueKind);
    }

    [Fact]
    public async Task Subtask_CannotBePinned()
    {
        var groupId = await CreateTask(new { name = "Group", estimatedMinutes = 0, taskType = "Group" });
        var subId = await CreateTask(new { name = "Sub", estimatedMinutes = 15, parentTaskId = groupId });

        var response = await _client.PutAsJsonAsync($"/api/Tasks/{subId}/pin", new { pinned = true });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task<int> CreateTask(object body)
    {
        var response = await _client.PostAsJsonAsync("/api/Tasks", body);
        response.EnsureSuccessStatusCode();
        return (await ReadJson(response)).GetProperty("id").GetInt32();
    }

    private static async Task<JsonElement> ReadJson(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
}
