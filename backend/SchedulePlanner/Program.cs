using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;
using SchedulePlanner.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddOpenApi();
builder.Services.AddDbContext<ScheduleContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
    .AddEntityFrameworkStores<ScheduleContext>()
    .AddDefaultTokenProviders();

// This is an API consumed by the Vue SPA, not server-rendered pages, so
// unauthenticated/forbidden requests should get a plain status code back for
// axios to handle - not a redirect to a non-existent "/Account/Login" page.
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

// Every endpoint requires an authenticated session unless explicitly marked
// [AllowAnonymous] - fails closed, so a forgotten [Authorize] on a new
// controller doesn't leave it open.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// Identity's account lockout (5 failed attempts -> 5 min lock, wired in
// AuthController) already stops a guessed password from working, but
// doesn't stop the requests themselves. This caps login attempts per IP
// on top of that, scoped to just this one endpoint - once Funnel makes it
// internet-reachable, unlimited unauthenticated POSTs to it shouldn't be
// free.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", httpContext => RateLimitPartition.GetFixedWindowLimiter(
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

builder.Services.AddScoped<IScheduleEntryService, ScheduleEntryService>();
builder.Services.AddScoped<ITaskItemService, TaskItemService>();
builder.Services.AddScoped<BalanceAdjustmentService>();
builder.Services.AddScoped<WorkGoalSettingsService>();
builder.Services.AddScoped<HolidayYearSettingService>();
builder.Services.AddHttpClient<WeatherService>(client =>
{
    client.BaseAddress = new Uri("https://api.open-meteo.com/");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddCors(options =>
    options.AddPolicy("Dev", policy => policy
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod()
        // The dev frontend runs on a different port than the API, so the
        // auth cookie only round-trips if the browser is told it's allowed
        // to send credentials cross-origin here.
        .AllowCredentials()));

var app = builder.Build();

// Applies any pending migrations on startup, so a fresh deploy (e.g. onto the
// Pi) doesn't need the `dotnet-ef` CLI installed just to create the schema.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<ScheduleContext>().Database.Migrate();
}

// One-time bootstrap: if the app has never had a user, create exactly one
// from env vars. Runs on every startup but is a no-op after the first
// successful boot - there is deliberately no other way to create a user
// (no public registration), so this is the only account creation path
// until an in-app admin panel exists.
using (var scope = app.Services.CreateScope())
{
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    if (!userManager.Users.Any())
    {
        var seedUsername = builder.Configuration["ADMIN_USERNAME"];
        var seedPassword = builder.Configuration["ADMIN_PASSWORD"];
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

        if (string.IsNullOrEmpty(seedUsername) || string.IsNullOrEmpty(seedPassword))
        {
            logger.LogWarning(
                "No users exist and ADMIN_USERNAME/ADMIN_PASSWORD are not set - " +
                "nobody will be able to log in until they are set and the app restarts.");
        }
        else
        {
            var user = new ApplicationUser { UserName = seedUsername };
            var result = await userManager.CreateAsync(user, seedPassword);
            if (result.Succeeded)
            {
                logger.LogInformation("Seeded initial user {Username}", seedUsername);
            }
            else
            {
                logger.LogError(
                    "Failed to seed initial user {Username}: {Errors}",
                    seedUsername, string.Join("; ", result.Errors.Select(e => e.Description)));
            }
        }
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(errorApp =>
    {
        errorApp.Run(async context =>
        {
            var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
            context.RequestServices.GetRequiredService<ILogger<Program>>()
                .LogError(exception, "Unhandled exception on {Path}", context.Request.Path);

            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred."
            });
        });
    });
}

// Serves the built frontend (frontend/dist copied into wwwroot) so the app
// is a single process/port in production - see the deploy notes.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors("Dev");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // Dev-only: hosted over Tailscale as plain HTTP by design, so there's no
    // HTTPS listener outside Development for this to redirect to.
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();

// Anything not matched by an API route or a static file falls back to the
// SPA's index.html, so Vue Router's client-side routes work on a hard
// refresh. Must stay anonymous - the login page itself is served this way,
// and the global fallback policy would otherwise 401 it before the SPA ever
// gets a chance to show the login screen.
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

// Top-level statements generate an internal Program class by default; making
// it a public partial class lets the test project's WebApplicationFactory<Program>
// reference it from another assembly.
public partial class Program { }