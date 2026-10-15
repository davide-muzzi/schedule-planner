namespace SchedulePlanner.Tests;

using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SchedulePlanner.Models;

// Runs the real app (real routing, model validation, controllers, CORS,
// exception handling) against a private in-memory database instead of the
// real schedule.db, so integration tests can't touch actual data.
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    // Seeded into the in-memory database on startup by Program.cs's normal
    // ADMIN_USERNAME/ADMIN_PASSWORD bootstrap.
    private const string TestUsername = "test-user";
    private const string TestPassword = "Test-Passw0rd!";

    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    public TestWebApplicationFactory()
    {
        _connection.Open();
    }

    // Every endpoint except login requires a session, so tests that exercise
    // the API need a client that has logged in first. The client keeps the
    // auth cookie for every request after this one.
    public async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/Auth/login", new { username = TestUsername, password = TestPassword });
        response.EnsureSuccessStatusCode();
        return client;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Not "Development", so a local appsettings.Development.json (which
        // may hold real ADMIN_* values) doesn't override the test account.
        builder.UseEnvironment("Testing");
        builder.UseSetting("ADMIN_USERNAME", TestUsername);
        builder.UseSetting("ADMIN_PASSWORD", TestPassword);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ScheduleContext>>();
            services.AddDbContext<ScheduleContext>(options => options.UseSqlite(_connection));
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
        }
    }
}
