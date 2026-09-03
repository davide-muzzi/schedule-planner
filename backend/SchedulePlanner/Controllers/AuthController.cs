namespace SchedulePlanner.Controllers;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SchedulePlanner.Dtos;
using SchedulePlanner.Models;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ILogger<AuthController> _logger;

    public AuthController(SignInManager<ApplicationUser> signInManager, ILogger<AuthController> logger)
    {
        _signInManager = signInManager;
        _logger = logger;
    }

    // Reports the current session so the frontend router guard can tell
    // whether to show the app or redirect to login. Protected by the
    // default fallback policy, so an unauthenticated call just gets a 401 -
    // that's the signal the frontend needs, not an error case to special-case.
    [HttpGet("me")]
    public IActionResult Me()
    {
        return Ok(new { username = User.Identity!.Name });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var result = await _signInManager.PasswordSignInAsync(
            dto.Username, dto.Password, isPersistent: true, lockoutOnFailure: true);

        if (!result.Succeeded)
        {
            _logger.LogWarning("Failed login attempt for {Username}", dto.Username);
            return Unauthorized(new { message = "Invalid username or password." });
        }

        _logger.LogInformation("Login succeeded for {Username}", dto.Username);
        return Ok(new { username = dto.Username });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _signInManager.SignOutAsync();
        return NoContent();
    }
}
