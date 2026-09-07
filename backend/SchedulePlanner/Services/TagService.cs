namespace SchedulePlanner.Services;

using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SchedulePlanner.Models;

public class TagService : ITagService
{
    private readonly ScheduleContext _context;

    public TagService(ScheduleContext context)
    {
        _context = context;
    }

    public async Task<List<Tag>> GetAllAsync()
    {
        return await _context.Tags.OrderBy(t => t.Name).ToListAsync();
    }

    public async Task<Tag> CreateAsync(Tag tag)
    {
        await Validate(tag, id: null);

        _context.Tags.Add(tag);
        await _context.SaveChangesAsync();
        return tag;
    }

    public async Task<Tag?> UpdateAsync(int id, Tag tag)
    {
        var existing = await _context.Tags.FindAsync(id);
        if (existing is null)
        {
            return null;
        }

        await Validate(tag, id);

        existing.Name = tag.Name;
        existing.Color = tag.Color;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var existing = await _context.Tags.FindAsync(id);
        if (existing is null)
        {
            return false;
        }

        _context.Tags.Remove(existing);
        await _context.SaveChangesAsync();
        return true;
    }

    private static readonly Regex HexColorPattern = new("^#[0-9A-Fa-f]{6}$");

    private async Task Validate(Tag tag, int? id)
    {
        if (string.IsNullOrWhiteSpace(tag.Name))
        {
            throw new ArgumentException("Tag name is required.");
        }
        if (tag.Color is not null && !HexColorPattern.IsMatch(tag.Color))
        {
            throw new ArgumentException("Color must be a hex value like #3b82f6.");
        }

        var normalized = tag.Name.Trim();
        var duplicate = await _context.Tags
            .Where(t => t.Id != id && t.Name.ToLower() == normalized.ToLower())
            .AnyAsync();
        if (duplicate)
        {
            throw new ArgumentException($"A tag named \"{normalized}\" already exists.");
        }
    }
}
