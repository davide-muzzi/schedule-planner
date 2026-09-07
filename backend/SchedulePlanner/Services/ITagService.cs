namespace SchedulePlanner.Services;

using SchedulePlanner.Models;

public interface ITagService
{
    Task<List<Tag>> GetAllAsync();
    Task<Tag> CreateAsync(Tag tag);
    Task<Tag?> UpdateAsync(int id, Tag tag);
    Task<bool> DeleteAsync(int id);
}
