using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
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
builder.Services.AddScoped<IScheduleEntryService, ScheduleEntryService>();
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
        .AllowAnyMethod()));

var app = builder.Build();

// Applies any pending migrations on startup, so a fresh deploy (e.g. onto the
// Pi) doesn't need the `dotnet-ef` CLI installed just to create the schema.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<ScheduleContext>().Database.Migrate();
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

app.UseAuthorization();

app.MapControllers();

// Anything not matched by an API route or a static file falls back to the
// SPA's index.html, so Vue Router's client-side routes work on a hard refresh.
app.MapFallbackToFile("index.html");

app.Run();

// Top-level statements generate an internal Program class by default; making
// it a public partial class lets the test project's WebApplicationFactory<Program>
// reference it from another assembly.
public partial class Program { }