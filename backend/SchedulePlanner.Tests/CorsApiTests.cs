namespace SchedulePlanner.Tests;

// Confirms the CORS policy in Program.cs actually behaves the way it's
// configured: allowed origins get the header back, anything else doesn't.
public class CorsApiTests : IAsyncLifetime
{
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

    [Fact]
    public async Task Get_FromAllowedOrigin_IncludesAccessControlAllowOriginHeader()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/ScheduleEntries");
        request.Headers.Add("Origin", "http://localhost:5173");

        var response = await _client.SendAsync(request);

        Assert.True(response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.Equal("http://localhost:5173", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Get_FromDisallowedOrigin_DoesNotIncludeAccessControlAllowOriginHeader()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/ScheduleEntries");
        request.Headers.Add("Origin", "http://evil.example.com");

        var response = await _client.SendAsync(request);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
