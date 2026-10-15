namespace SchedulePlanner.Tests;

using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SchedulePlanner.Models;

// Confirms the ADMIN_RESET_PASSWORD startup block in Program.cs. Each test
// starts the real app twice against the same in-memory database - first to
// seed the account, then with the reset setting - the same way a restart
// with a changed service file would on the server.
public class PasswordResetTests : IDisposable
{
    private const string Username = "admin";
    private const string OldPassword = "Old-Passw0rd!";
    private const string NewPassword = "New-Passw0rd!";

    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    public PasswordResetTests()
    {
        _connection.Open();
    }

    public void Dispose()
    {
        _connection.Dispose();
    }

    [Fact]
    public async Task Reset_WithNewPassword_NewPasswordWorksAndOldDoesNot()
    {
        SeedAccount();

        using var factory = StartApp(("ADMIN_RESET_PASSWORD", NewPassword));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await Login(client, NewPassword));
        Assert.Equal(HttpStatusCode.Unauthorized, await Login(client, OldPassword));
    }

    [Fact]
    public async Task Reset_WithoutUsername_ResetsTheOnlyAccount()
    {
        SeedAccount();

        // No ADMIN_USERNAME here - falls back to the single existing account.
        using var factory = new SettingsFactory(_connection, ("ADMIN_RESET_PASSWORD", NewPassword));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await Login(client, NewPassword));
    }

    [Fact]
    public async Task Reset_WithTooWeakPassword_KeepsOldPassword()
    {
        SeedAccount();

        using var factory = StartApp(("ADMIN_RESET_PASSWORD", "weak"));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await Login(client, OldPassword));
        Assert.Equal(HttpStatusCode.Unauthorized, await Login(client, "weak"));
    }

    [Fact]
    public async Task Reset_LiftsLockoutFromFailedLogins()
    {
        using (var seedFactory = StartApp())
        using (var seedClient = seedFactory.CreateClient())
        {
            // 5 failed attempts lock the account (see AuthController). Checked
            // on the user directly - a 6th login would hit the rate limiter.
            for (var i = 0; i < 5; i++)
            {
                await Login(seedClient, "Wrong-Passw0rd!");
            }

            using var scope = seedFactory.Services.CreateScope();
            var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.True(await userManager.IsLockedOutAsync((await userManager.FindByNameAsync(Username))!));
        }

        using var factory = StartApp(("ADMIN_RESET_PASSWORD", NewPassword));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await Login(client, NewPassword));
    }

    [Fact]
    public async Task Restart_WithoutResetSetting_LeavesPasswordUnchanged()
    {
        SeedAccount();

        using var factory = StartApp();
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await Login(client, OldPassword));
    }

    // Starts the app once with the original credentials so the account
    // exists, the way it does on any instance that's already running.
    private void SeedAccount()
    {
        using var factory = StartApp();
        factory.CreateClient().Dispose();
    }

    private SettingsFactory StartApp(params (string Key, string Value)[] extraSettings)
    {
        var settings = new List<(string, string)>
        {
            ("ADMIN_USERNAME", Username),
            ("ADMIN_PASSWORD", OldPassword),
        };
        settings.AddRange(extraSettings);
        return new SettingsFactory(_connection, settings.ToArray());
    }

    private static async Task<HttpStatusCode> Login(HttpClient client, string password)
    {
        var response = await client.PostAsJsonAsync("/api/Auth/login", new { username = Username, password });
        return response.StatusCode;
    }

    // Like TestWebApplicationFactory, but with config settings and a database
    // connection owned by the test, so it outlives a single app instance.
    private class SettingsFactory : WebApplicationFactory<Program>
    {
        private readonly SqliteConnection _connection;
        private readonly (string Key, string Value)[] _settings;

        public SettingsFactory(SqliteConnection connection, params (string Key, string Value)[] settings)
        {
            _connection = connection;
            _settings = settings;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // Not "Development", so a local appsettings.Development.json (which
            // may hold real ADMIN_* values) doesn't leak into these tests.
            builder.UseEnvironment("Testing");

            foreach (var (key, value) in _settings)
            {
                builder.UseSetting(key, value);
            }

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<ScheduleContext>>();
                services.AddDbContext<ScheduleContext>(options => options.UseSqlite(_connection));
            });
        }
    }
}
