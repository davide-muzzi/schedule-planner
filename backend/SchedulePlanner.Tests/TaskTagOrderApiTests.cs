namespace SchedulePlanner.Tests;

using System.Net.Http.Json;
using System.Text.Json;

// A task's tags come back in the order they were given, not by id/name -
// the frontend's "First tag's color" relies on that order sticking.
public class TaskTagOrderApiTests : IAsyncLifetime
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
    public async Task Tags_KeepGivenOrder_OnCreateAndUpdate()
    {
        var a = await CreateTag("Alpha");
        var b = await CreateTag("Bravo");
        var c = await CreateTag("Charlie");

        var created = await _client.PostAsJsonAsync(
            "/api/Tasks", new { name = "Ordered", estimatedMinutes = 30, tagIds = new[] { c, a } });
        created.EnsureSuccessStatusCode();
        var task = await ReadJson(created);
        Assert.Equal(new[] { c, a }, TagIds(task));

        var taskId = task.GetProperty("id").GetInt32();
        var updated = await _client.PutAsJsonAsync(
            $"/api/Tasks/{taskId}", new { name = "Ordered", estimatedMinutes = 30, tagIds = new[] { b, c, a } });
        updated.EnsureSuccessStatusCode();
        Assert.Equal(new[] { b, c, a }, TagIds(await ReadJson(updated)));

        var fetched = await ReadJson(await _client.GetAsync($"/api/Tasks/{taskId}"));
        Assert.Equal(new[] { b, c, a }, TagIds(fetched));
    }

    private async Task<int> CreateTag(string name)
    {
        var response = await _client.PostAsJsonAsync("/api/Tags", new { name });
        response.EnsureSuccessStatusCode();
        return (await ReadJson(response)).GetProperty("id").GetInt32();
    }

    private static async Task<JsonElement> ReadJson(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static int[] TagIds(JsonElement task) =>
        task.GetProperty("tags").EnumerateArray().Select(t => t.GetProperty("id").GetInt32()).ToArray();
}
